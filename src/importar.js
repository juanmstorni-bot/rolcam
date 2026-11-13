// Importa personajes 3D con esqueleto que NO son VRM (archivos .glb y .fbx, como los que
// exportan Meshy, Mixamo, Blender, etc.) y los deja listos para animar igual que un VRM:
//   1. reconoce los huesos por su nombre (hombro, codo, mano, cabeza…),
//   2. gira, escala y centra el modelo para que mire a la cámara,
//   3. lo lleva a la pose en T,
//   4. arma el "esqueleto normalizado" que usa el resto del programa.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { VRMHumanoid } from '@pixiv/three-vrm';

const PREFIJOS = new Set(['mixamorig', 'mixamorig1', 'mixamorig2', 'bip', 'bip01', 'bip001', 'j', 'c', 'def', 'org', 'armature', 'valvebiped', 'rig', 'bone', 'jnt', 'joint', 'sk', 'b', 'cc', 'base']);
const DESCARTAR = /twist|roll|ik|pole|ctrl|control|helper|nub|end$|top$|target|socket|weapon|prop|attach/;
const DEDOS = { thumb: 'Thumb', index: 'Index', middle: 'Middle', mid: 'Middle', ring: 'Ring', pinky: 'Little', little: 'Little' };

// "mixamorig:LeftForeArm" -> { lado: 'left', clave: 'forearm' }
function analizarNombre(nombre) {
  const sinEspacio = String(nombre).replace(/^.*[:|]/, '');
  const partes = sinEspacio.replace(/([a-z])([A-Z])/g, '$1 $2').split(/[^A-Za-z0-9]+/).filter(Boolean).map((p) => p.toLowerCase());
  let lado = null;
  const resto = [];
  for (const p of partes) {
    if (p === 'l' || p === 'left') lado = 'left';
    else if (p === 'r' || p === 'right') lado = 'right';
    else if (!PREFIJOS.has(p)) resto.push(p);
  }
  return { lado, clave: resto.join('') };
}

// Devuelve el nombre de hueso humanoide (el del estándar VRM) o null.
function clasificar(nombre) {
  const { lado, clave } = analizarNombre(nombre);
  if (!clave || DESCARTAR.test(clave)) return null;

  for (const [palabra, dedo] of Object.entries(DEDOS)) {
    if (!clave.includes(palabra)) continue;
    if (!lado) return null;
    let tramo = null;
    if (clave.includes('metacarpal')) tramo = 0;
    else if (clave.includes('proximal')) tramo = 1;
    else if (clave.includes('intermediate')) tramo = 2;
    else if (clave.includes('distal')) tramo = 3;
    else {
      const n = clave.match(/(\d+)/);
      if (!n) return null;
      const num = Number(n[1]);
      if (num < 1 || num > 3) return null;
      tramo = dedo === 'Thumb' ? num - 1 : num;          // el pulgar empieza un tramo antes
    }
    const nombres = dedo === 'Thumb' ? ['Metacarpal', 'Proximal', 'Distal'] : [null, 'Proximal', 'Intermediate', 'Distal'];
    return nombres[tramo] ? { hueso: lado + dedo + nombres[tramo] } : null;
  }

  if (lado) {
    const L = (n) => ({ hueso: lado + n });
    if (/hand|wrist/.test(clave)) return L('Hand');
    if (/forearm|lowerarm|elbow/.test(clave)) return L('LowerArm');
    if (/clavicle|collar|shoulder/.test(clave)) return L('Shoulder');
    if (/upperarm|uparm|shldr|bicep/.test(clave) || clave === 'arm') return L('UpperArm');
    if (/toe/.test(clave)) return L('Toes');
    if (/foot|ankle/.test(clave)) return L('Foot');
    if (/upleg|upperleg|thigh/.test(clave)) return L('UpperLeg');
    if (/lowerleg|calf|shin|knee/.test(clave) || clave === 'leg') return L('LowerLeg');
    return null;
  }
  if (/hips|pelvis/.test(clave) || clave === 'hip') return { hueso: 'hips' };
  if (/upperchest/.test(clave)) return { hueso: 'upperChest' };
  if (/chest/.test(clave)) return { hueso: 'chest' };
  if (/spine/.test(clave)) return { hueso: 'spine', serie: true };
  if (/neck/.test(clave)) return { hueso: 'neck' };
  if (/head/.test(clave)) return { hueso: 'head' };
  return null;
}

const profundidad = (o) => { let d = 0; while (o.parent) { d++; o = o.parent; } return d; };

function mapearHuesos(raiz) {
  const candidatos = new Map();     // hueso humanoide -> nodos posibles
  const columna = [];
  raiz.traverse((o) => {
    if (!o.isBone && !(o.type === 'Object3D' || o.type === 'Group')) return;
    const c = clasificar(o.name);
    if (!c) return;
    if (c.serie) { columna.push(o); return; }
    if (!candidatos.has(c.hueso)) candidatos.set(c.hueso, []);
    candidatos.get(c.hueso).push(o);
  });
  const mapa = {};
  // Si hay varios con el mismo papel, gana el hueso real y, entre ellos, el más cercano a la raíz.
  const elegir = (lista) => lista.sort((a, b) => (b.isBone ? 1 : 0) - (a.isBone ? 1 : 0) || profundidad(a) - profundidad(b))[0];
  for (const [hueso, lista] of candidatos) mapa[hueso] = elegir(lista);
  // La columna suele venir como Spine, Spine1, Spine2: se reparten de abajo hacia arriba.
  const huesosColumna = columna.filter((o) => o.isBone).sort((a, b) => profundidad(a) - profundidad(b));
  const serie = huesosColumna.length ? huesosColumna : columna.sort((a, b) => profundidad(a) - profundidad(b));
  if (serie[0]) mapa.spine = serie[0];
  if (serie[1] && !mapa.chest) mapa.chest = serie[1];
  if (serie[2] && !mapa.upperChest) mapa.upperChest = serie[2];
  return mapa;
}

const posMundo = (o) => o.getWorldPosition(new THREE.Vector3());

// Muchos modelos (sobre todo los que vienen de juegos) traen huesos "sueltos" para el arma,
// el escudo o accesorios, colgados de la raíz en lugar de la mano. Si se dejan así, la mano
// se mueve y el arma queda en su lugar, y la malla se estira entre los dos. Acá se engancha
// cada hueso u objeto suelto al hueso del cuerpo más cercano a la parte de la malla que mueve.
function reengancharSueltos(modelo, mapa) {
  const mapeados = new Set(Object.values(mapa));
  const ancestros = new Set();
  for (const n of mapeados) { let p = n.parent; while (p) { ancestros.add(p); p = p.parent; } }
  const esSuelto = (o) => {
    if (o === modelo || mapeados.has(o) || ancestros.has(o)) return false;
    if (!(o.isBone || (o.isMesh && !o.isSkinnedMesh))) return false;
    for (let p = o.parent; p; p = p.parent) if (mapeados.has(p)) return false;   // ya cuelga del cuerpo
    return true;
  };
  const sueltos = [];
  modelo.traverse((o) => {
    if (!esSuelto(o)) return;
    for (let p = o.parent; p && p !== modelo; p = p.parent) if (esSuelto(p)) return;   // lo arrastra su padre
    sueltos.push(o);
  });
  if (!sueltos.length) return [];

  const mallas = [];
  modelo.traverse((o) => { if (o.isSkinnedMesh) mallas.push(o); });
  const v = new THREE.Vector3();
  const informe = [];
  for (const suelto of sueltos) {
    // Centro de la parte de la malla que depende de este hueso (o del objeto, si no es hueso).
    const centro = new THREE.Vector3();
    let cuenta = 0;
    if (suelto.isBone) {
      const familia = new Set();
      suelto.traverse((h) => familia.add(h));
      for (const malla of mallas) {
        const indices = new Set();
        malla.skeleton.bones.forEach((h, i) => { if (familia.has(h)) indices.add(i); });
        const pos = malla.geometry.attributes.position, si = malla.geometry.attributes.skinIndex, sw = malla.geometry.attributes.skinWeight;
        if (!indices.size || !pos || !si || !sw) continue;
        for (let i = 0; i < pos.count; i++) {
          let peso = 0;
          if (indices.has(si.getX(i))) peso += sw.getX(i);
          if (indices.has(si.getY(i))) peso += sw.getY(i);
          if (indices.has(si.getZ(i))) peso += sw.getZ(i);
          if (indices.has(si.getW(i))) peso += sw.getW(i);
          if (peso > 0.5) { centro.add(v.fromBufferAttribute(pos, i).applyMatrix4(malla.matrixWorld)); cuenta++; }
        }
      }
    } else {
      new THREE.Box3().setFromObject(suelto).getCenter(centro); cuenta = 1;
    }
    if (cuenta) centro.divideScalar(suelto.isBone ? cuenta : 1); else centro.copy(posMundo(suelto));
    let mejor = null, distancia = Infinity;
    for (const [nombre, nodo] of Object.entries(mapa)) {
      const d = posMundo(nodo).distanceToSquared(centro);
      if (d < distancia) { distancia = d; mejor = [nombre, nodo]; }
    }
    if (mejor) { mejor[1].attach(suelto); informe.push((suelto.name || '(sin nombre)') + ' -> ' + mejor[0]); }
  }
  return informe;
}

// Gira un hueso para que el tramo hacia su hijo apunte en la dirección pedida (en el mundo).
function apuntar(hueso, hijo, direccion) {
  if (!hueso || !hijo) return;
  hueso.updateWorldMatrix(true, true);
  const actual = posMundo(hijo).sub(posMundo(hueso));
  if (actual.lengthSq() < 1e-12) return;
  const giro = new THREE.Quaternion().setFromUnitVectors(actual.normalize(), direccion);
  const padre = hueso.parent.getWorldQuaternion(new THREE.Quaternion());
  const mundo = hueso.getWorldQuaternion(new THREE.Quaternion());
  hueso.quaternion.copy(padre.invert().multiply(giro).multiply(mundo));
  hueso.updateWorldMatrix(false, true);
}

function cargarArchivo(url, formato) {
  return new Promise((ok, mal) => {
    if (formato === 'fbx') new FBXLoader().load(url, ok, undefined, mal);
    else new GLTFLoader().load(url, (gltf) => ok(gltf.scene), undefined, mal);
  });
}

// Devuelve un objeto con la misma forma que un VRM cargado (scene, humanoid, update…)
// más un informe de qué huesos se reconocieron.
export async function cargarModeloGenerico(url, formato) {
  const modelo = await cargarArchivo(url, formato);
  const envoltorio = new THREE.Group();
  envoltorio.add(modelo);
  envoltorio.updateMatrixWorld(true);

  const mapa = mapearHuesos(modelo);
  const necesarios = ['hips', 'head', 'leftUpperArm', 'leftLowerArm', 'rightUpperArm', 'rightLowerArm'];
  const faltan = necesarios.filter((h) => !mapa[h]);
  if (faltan.length) {
    // Lista de nombres a la terminal: sirve para ampliar el reconocimiento.
    const nombres = [];
    modelo.traverse((o) => { if (o.isBone) nombres.push(o.name); });
    console.log('HUESOS DEL MODELO (' + nombres.length + '): ' + nombres.slice(0, 200).join(' | '));
    const error = new Error('No se reconoció el esqueleto del modelo (faltan: ' + faltan.join(', ') + ').');
    error.faltan = faltan;
    throw error;
  }

  const enganchados = reengancharSueltos(modelo, mapa);
  console.log('Huesos reconocidos: ' + Object.entries(mapa).map(([k, n]) => k + '=' + n.name).join(', '));
  if (enganchados.length) console.log('Piezas sueltas enganchadas al cuerpo: ' + enganchados.join('; '));
  envoltorio.updateMatrixWorld(true);

  // 1. Que mire a la cámara: el hombro izquierdo del personaje tiene que quedar hacia +X.
  const entreHombros = posMundo(mapa.leftUpperArm).sub(posMundo(mapa.rightUpperArm));
  envoltorio.rotation.y = Math.atan2(entreHombros.z, entreHombros.x);
  envoltorio.updateMatrixWorld(true);

  // 2. Tamaño estándar: medio metro de la cadera a la cabeza, cabeza a 1,40 m.
  const tramo = posMundo(mapa.head).distanceTo(posMundo(mapa.hips));
  envoltorio.scale.setScalar(0.5 / Math.max(tramo, 1e-6));
  envoltorio.updateMatrixWorld(true);
  const cabeza = posMundo(mapa.head), cadera = posMundo(mapa.hips);
  envoltorio.position.set(-cadera.x, 1.4 - cabeza.y, -cadera.z);
  envoltorio.updateMatrixWorld(true);

  // 3. Pose en T: brazos horizontales (muchos modelos vienen con los brazos a 45°).
  for (const [lado, x] of [['left', 1], ['right', -1]]) {
    const dir = new THREE.Vector3(x, 0, 0);
    apuntar(mapa[lado + 'UpperArm'], mapa[lado + 'LowerArm'], dir);
    apuntar(mapa[lado + 'LowerArm'], mapa[lado + 'Hand'], dir);
    apuntar(mapa[lado + 'Hand'], mapa[lado + 'MiddleProximal'], dir);
  }
  envoltorio.updateMatrixWorld(true);

  // 4. Esqueleto normalizado, el mismo que usan los VRM.
  const huesos = {};
  for (const [nombre, nodo] of Object.entries(mapa)) huesos[nombre] = { node: nodo };
  const humanoid = new VRMHumanoid(huesos, { autoUpdateHumanBones: true });

  const scene = new THREE.Group();
  scene.add(envoltorio, humanoid.normalizedHumanBonesRoot);
  scene.traverse((o) => { o.frustumCulled = false; });

  return {
    scene, humanoid,
    expressionManager: null,                 // estos modelos no traen expresiones faciales
    meta: { metaVersion: '1' },              // queda mirando a +Z, como un VRM 1.0
    update() { humanoid.update(); },
    informe: { enganchados: enganchados.length, reconocidos: Object.keys(mapa).length, conDedos: Object.keys(mapa).some((h) => /Index|Thumb/.test(h)) },
  };
}

export { analizarNombre, clasificar };
