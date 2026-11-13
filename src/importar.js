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
    const error = new Error('No se reconoció el esqueleto del modelo (faltan: ' + faltan.join(', ') + ').');
    error.faltan = faltan;
    throw error;
  }

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
    informe: { reconocidos: Object.keys(mapa).length, conDedos: Object.keys(mapa).some((h) => /Index|Thumb/.test(h)) },
  };
}

export { analizarNombre, clasificar };
