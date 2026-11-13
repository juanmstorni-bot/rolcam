// Ventana visible: dibuja el personaje y lo mueve según los puntos que llegan
// desde la ventana de seguimiento.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import * as Kalidokit from 'kalidokit';
import { cargarModeloGenerico } from './importar.js';
import { Titere2D, marcadoresPorDefecto, quitarFondoLiso, tieneTransparencia } from './titere2d.js';

const puente = window.puente;
const $ = (id) => document.getElementById(id);
const estadoEl = $('estado'), medidasEl = $('medidas');
const ponerEstado = (t) => { estadoEl.textContent = t; };

// ---------- Escena ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('lienzo'), antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const escena = new THREE.Scene();
escena.background = new THREE.Color($('fondo').value);
const camara = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
camara.position.set(0, 1.35, 1.9);
camara.lookAt(0, 1.3, 0);
const luz = new THREE.DirectionalLight(0xffffff, Math.PI);
luz.position.set(1, 1, 1);
escena.add(luz, new THREE.AmbientLight(0xffffff, 0.6));

// ---------- Fondo ----------
let texturaFondo = null;
// La imagen cubre toda la ventana sin deformarse (recorta lo que sobra).
function encajarFondo() {
  if (!texturaFondo || !texturaFondo.image) return;
  const ventana = window.innerWidth / window.innerHeight;
  const imagen = texturaFondo.image.width / texturaFondo.image.height;
  if (imagen > ventana) { texturaFondo.repeat.set(ventana / imagen, 1); texturaFondo.offset.set((1 - ventana / imagen) / 2, 0); }
  else { texturaFondo.repeat.set(1, imagen / ventana); texturaFondo.offset.set(0, (1 - imagen / ventana) / 2); }
}
function ponerFondoImagen(url) {
  new THREE.TextureLoader().load(url, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    if (texturaFondo) texturaFondo.dispose();
    texturaFondo = tex;
    encajarFondo();
    escena.background = tex;
  }, undefined, () => { console.error('No se pudo cargar la imagen de fondo'); quitarFondoImagen(); });
}
function quitarFondoImagen() {
  if (texturaFondo) { texturaFondo.dispose(); texturaFondo = null; }
  escena.background = new THREE.Color($('fondo').value);
}

function ajustarTamano() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camara.aspect = window.innerWidth / window.innerHeight;
  camara.updateProjectionMatrix();
  encajarFondo();
}
window.addEventListener('resize', ajustarTamano);
ajustarTamano();

// ---------- Personaje ----------
let vrm = null;        // personaje 3D (VRM)…
let titere = null;     // …o personaje ilustrado 2.5D; nunca los dos a la vez
let imagenTitere = null;
function quitarPersonajeActual() {
  if (vrm) { escena.remove(vrm.scene); VRMUtils.deepDispose(vrm.scene); vrm = null; }
  if (titere) { escena.remove(titere.objeto); titere.liberar(); titere = null; }
  $('editarTitere').hidden = true;
}
let signoEjes = 1; // VRM 0.x = 1, VRM 1.0 = -1 (el modelo mira hacia el otro lado)
const cargador = new GLTFLoader();
cargador.register((parser) => new VRMLoaderPlugin(parser));

// Pone en escena un personaje ya cargado (VRM o importado) y reinicia su pose.
function instalarPersonaje(nuevo, nombre) {
  nuevo.scene.traverse((o) => { o.frustumCulled = false; });
  quitarPersonajeActual();
  signoEjes = nuevo.meta && nuevo.meta.metaVersion === '0' ? 1 : -1;
  vrm = nuevo;
  escena.add(vrm.scene);
  objetivosHueso.clear();
  objetivosExpresion.clear();
  poseDeReposo();
  console.log('Personaje cargado: ' + nombre);
}

function cargarVRM(url, nombre) {
  ponerEstado('Cargando ' + nombre + '…');
  cargador.load(url, (gltf) => {
    const nuevo = gltf.userData.vrm;
    if (!nuevo) { ponerEstado('Ese archivo no es un VRM válido.'); return; }
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);
    VRMUtils.rotateVRM0(nuevo);
    instalarPersonaje(nuevo, nombre);
    ponerEstado('Personaje listo: ' + nombre + '.');
  }, undefined, (err) => {
    console.error('No se pudo cargar el personaje: ' + (err.message || err));
    ponerEstado('No se pudo cargar el personaje (' + nombre + '). Corré "npm run recursos" o arrastrá un .vrm a la ventana.');
  });
}

// Modelos con esqueleto que no son VRM (.glb y .fbx).
async function cargarImportado(url, nombre, formato) {
  ponerEstado('Importando ' + nombre + '…');
  try {
    const nuevo = await cargarModeloGenerico(url, formato);
    instalarPersonaje(nuevo, nombre);
    ponerEstado('Personaje listo: ' + nombre + '. Huesos reconocidos: ' + nuevo.informe.reconocidos +
      (nuevo.informe.conDedos ? ', con dedos.' : ', sin dedos.') + (nuevo.informe.enganchados ? ' Piezas sueltas enganchadas: ' + nuevo.informe.enganchados + '.' : '') + ' Este formato no trae expresiones de cara.');
    return true;
  } catch (e) {
    console.error('No se pudo importar el modelo: ' + (e.stack || e.message || e));
    ponerEstado(e.faltan ? e.message + ' El modelo necesita un esqueleto humanoide con nombres de hueso estándar. La lista de huesos quedó en la terminal.'
      : 'No se pudo leer ese archivo como modelo 3D (' + nombre + ').');
    return false;
  }
}

const FORMATOS = { vrm: 'vrm', glb: 'glb', fbx: 'fbx' };
const formatoDe = (nombre) => FORMATOS[(String(nombre).split('.').pop() || '').toLowerCase()] || null;
function cargarPersonaje(url, nombre, formato) {
  if (formato === 'vrm') { cargarVRM(url, nombre); return Promise.resolve(true); }
  return cargarImportado(url, nombre, formato);
}

// ---------- Objetivos y suavizado ----------
// El seguimiento solo fija "objetivos"; el personaje se acerca a ellos en cada cuadro
// dibujado, así el movimiento se ve continuo aunque el seguimiento vaya a pocos fps.
const objetivosHueso = new Map();   // nombre de hueso -> THREE.Quaternion
const objetivosExpresion = new Map();
const expresionActual = new Map();
const entre01 = (v) => Math.min(1, Math.max(0, v));

function cuatDeEuler(rot, factor = 1) {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(
    rot.x * factor * signoEjes, rot.y * factor, rot.z * factor * signoEjes, rot.rotationOrder || 'XYZ'));
}
const fijarHueso = (nombre, cuat) => { if (cuat) objetivosHueso.set(nombre, cuat); };
const fijarEuler = (nombre, rot, factor = 1) => { if (rot) objetivosHueso.set(nombre, cuatDeEuler(rot, factor)); };

function aplicarObjetivos(dt) {
  if (!vrm) return;
  const velocidad = 30 - 26 * Number($('suavizado').value);   // más suavizado = respuesta más lenta
  const alfa = 1 - Math.exp(-dt * velocidad);
  for (const [nombre, q] of objetivosHueso) {
    const hueso = vrm.humanoid.getNormalizedBoneNode(nombre);
    if (hueso) hueso.quaternion.slerp(q, alfa);
  }
  const em = vrm.expressionManager;
  if (em) for (const [nombre, objetivo] of objetivosExpresion) {
    const v = (expresionActual.get(nombre) ?? 0) + (objetivo - (expresionActual.get(nombre) ?? 0)) * Math.min(1, alfa * 1.5);
    expresionActual.set(nombre, v);
    em.setValue(nombre, entre01(v));
  }
}

// Brazos abajo en vez de la pose en T, hasta que haya seguimiento.
function poseDeReposo() {
  fijarEuler('leftUpperArm', { x: 0, y: 0, z: 1.25 });
  fijarEuler('rightUpperArm', { x: 0, y: 0, z: -1.25 });
}

// ---------- Filtro anti-temblor (One Euro) ----------
// Filtra fuerte cuando el punto está quieto y casi nada cuando se mueve rápido.
class OneEuro {
  constructor() { this.x = null; this.dx = 0; this.t = 0; }
  filtrar(x, t, corteMin, beta) {
    const dt = (t - this.t) / 1000;
    if (this.x === null || dt > 0.6 || dt <= 0) { this.x = x; this.dx = 0; this.t = t; return x; }
    this.t = t;
    const alfa = (corte) => 1 / (1 + 1 / (2 * Math.PI * corte * dt));
    this.dx += alfa(1) * ((x - this.x) / dt - this.dx);
    this.x += alfa(corteMin + beta * Math.abs(this.dx)) * (x - this.x);
    return this.x;
  }
}
const filtros = new Map();
const corteTemblor = () => { const s = Number($('temblor').value); return 1.5 * (1 - s) + 0.15 * s; };
function suavizarValor(clave, v, t, beta = 3) {
  let f = filtros.get(clave);
  if (!f) filtros.set(clave, f = new OneEuro());
  return f.filtrar(v, t, corteTemblor(), beta);
}
function suavizarPuntos(clave, lms, t) {
  if (!lms) return lms;
  return lms.map((p, i) => ({
    x: suavizarValor(clave + i + 'x', p.x, t), y: suavizarValor(clave + i + 'y', p.y, t), z: suavizarValor(clave + i + 'z', p.z, t),
    visibility: p.visibility,
  }));
}
const enCuadro = (p, m = 0.04) => p.x > m && p.x < 1 - m && p.y > m && p.y < 1 - m;

// ---------- Orientación de la mano a partir de la palma ----------
function cuatDeEjes(largo, ancho) {
  const a = largo.clone().normalize();
  const n = new THREE.Vector3().crossVectors(a, ancho).normalize();
  const b = new THREE.Vector3().crossVectors(a, n);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(a, n, b));
}
// Reposo del personaje (pose en T, palmas hacia abajo, mirando a +Z).
const REPOSO_INV = {
  Left: cuatDeEjes(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)).invert(),
  Right: cuatDeEjes(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1)).invert(),
};
// Los puntos de la cámara se espejan (x, y, z invertidos): efecto espejo.
function cuatMundoMano(lado, lm, escala) {
  const p = (i) => new THREE.Vector3(-lm[i].x * escala.x, -lm[i].y * escala.y, -lm[i].z * escala.z);
  const muneca = p(0), indice = p(5), medio = p(9), menique = p(17);
  const largo = medio.sub(muneca), ancho = indice.sub(menique);
  if (largo.lengthSq() < 1e-10 || ancho.lengthSq() < 1e-10) return null;
  return cuatDeEjes(largo, ancho).multiply(REPOSO_INV[lado]);
}
const EJE_X = new THREE.Vector3(1, 0, 0);
// Reparte el giro alrededor del eje del brazo entre antebrazo y mano.
function repartirGiro(manoLocal) {
  const largo = Math.hypot(manoLocal.x, manoLocal.w);
  let giro = largo < 1e-6 ? 0 : 2 * Math.atan2(manoLocal.x / largo, manoLocal.w / largo);
  const centro = signoEjes * Math.PI / 2;   // el rango humano va de palma abajo (0) a palma arriba (180°)
  giro = ((((giro - centro + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI + centro;
  const mitad = new THREE.Quaternion().setFromAxisAngle(EJE_X, giro * 0.5);
  return { giroAntebrazo: mitad, mano: mitad.clone().invert().multiply(manoLocal) };
}

// ---------- Solver propio de brazos y torso ----------
// Cada hueso apunta hacia donde apunta el brazo real. Un brazo no depende del otro,
// y si un punto se ve mal se mantiene la última pose buena.
const espejar = (p) => new THREE.Vector3(-p.x, -p.y, -p.z);
const visible = (lm, i) => lm[i].visibility ?? 1;
const VIS_MIN = 0.5;
// Efecto espejo: el brazo izquierdo real (puntos 11, 13, 15) mueve el derecho del personaje.
const INDICES_BRAZO = { Right: [11, 13, 15], Left: [12, 14, 16] };
const REPOSO_LARGO = { Left: new THREE.Vector3(1, 0, 0), Right: new THREE.Vector3(-1, 0, 0) };
const estadoBrazo = { Left: { q: null, largo: null, visto: 0, munecaVista: 0 }, Right: { q: null, largo: null, visto: 0, munecaVista: 0 } };

function resolverBrazo(lado, lm, lm2d) {
  const [ih, ic, im] = INDICES_BRAZO[lado];
  if (Math.min(visible(lm, ih), visible(lm, ic)) < VIS_MIN) return null;
  const h = espejar(lm[ih]), c = espejar(lm[ic]), m = espejar(lm[im]);
  const dirSup = c.clone().sub(h);
  if (dirSup.lengthSq() < 1e-10) return null;
  dirSup.normalize();
  let dirInf = null;
  // La muñeca cerca del borde de la imagen da puntos poco confiables: se mantiene el antebrazo.
  if (visible(lm, im) >= VIS_MIN && enCuadro(lm2d[im])) {
    dirInf = m.sub(c);
    if (dirInf.lengthSq() < 1e-10) dirInf = null; else dirInf.normalize();
  }
  const st = estadoBrazo[lado];
  const flexion = dirInf ? new THREE.Vector3().crossVectors(dirSup, dirInf).length() : 0;
  let superior;
  if (flexion > 0.26) superior = cuatDeEjes(dirSup, dirInf).multiply(REPOSO_INV[lado]);                   // codo flexionado: funciona como bisagra
  else if (st.q) superior = new THREE.Quaternion().setFromUnitVectors(st.largo, dirSup).multiply(st.q);    // brazo recto: se conserva el giro anterior
  else superior = new THREE.Quaternion().setFromUnitVectors(REPOSO_LARGO[lado], dirSup);
  st.q = superior.clone(); st.largo = dirSup.clone();
  const inferior = dirInf ? new THREE.Quaternion().setFromUnitVectors(dirSup, dirInf).multiply(superior) : null;
  return { superior, inferior };
}

// Torso a partir de la línea de hombros (sentado, la cadera no se ve y no es confiable).
function resolverTorso(lm) {
  if (Math.min(visible(lm, 11), visible(lm, 12)) < VIS_MIN) return null;
  const hombros = espejar(lm[12]).sub(espejar(lm[11]));
  const limitar = (v, m) => Math.max(-m, Math.min(m, v));
  const giro = limitar(Math.atan2(-hombros.z, hombros.x) * 0.7, 0.8);
  const inclinacion = limitar(Math.atan2(hombros.y, Math.hypot(hombros.x, hombros.z)), 0.5);
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), giro)
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), inclinacion));
}

// ---------- Puntos -> huesos ----------
function moverCara(cara) {
  // Si el modelo no tiene hueso de cuello, la cabeza gira directamente.
  fijarEuler(vrm.humanoid.getNormalizedBoneNode('neck') ? 'neck' : 'head', cara.head, 0.7);
  objetivosExpresion.set('blink', entre01(1 - (cara.eye.l + cara.eye.r) / 2));
  const b = cara.mouth.shape;
  objetivosExpresion.set('aa', b.A); objetivosExpresion.set('ee', b.E); objetivosExpresion.set('ih', b.I);
  objetivosExpresion.set('oh', b.O); objetivosExpresion.set('ou', b.U);
}

const DEDOS = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'];
const FALANGES = ['Proximal', 'Intermediate', 'Distal'];
// VRM 1.0 nombra distinto los huesos del pulgar.
const PULGAR = { Proximal: 'ThumbMetacarpal', Intermediate: 'ThumbProximal', Distal: 'ThumbDistal' };

function moverBrazo(lado, cuerpo3d, cuerpo2d, mano) {
  const min = lado.toLowerCase();
  const huesoSup = vrm.humanoid.getNormalizedBoneNode(min + 'UpperArm');
  if (!huesoSup || !huesoSup.parent) return;
  const raiz = vrm.humanoid.normalizedHumanBonesRoot.getWorldQuaternion(new THREE.Quaternion());
  const padreMundo = huesoSup.parent.getWorldQuaternion(new THREE.Quaternion());

  const brazo = resolverBrazo(lado, cuerpo3d, cuerpo2d);
  const st = estadoBrazo[lado], ahora = performance.now();
  if (!brazo) {
    // Brazo fuera de cuadro o tapado: se mantiene la pose; tras 1 s vuelve al reposo.
    if (ahora - st.visto > 1000) {
      fijarEuler(min + 'UpperArm', { x: 0, y: 0, z: lado === 'Left' ? 1.25 : -1.25 });
      fijarHueso(min + 'LowerArm', new THREE.Quaternion());
      fijarHueso(min + 'Hand', new THREE.Quaternion());
      st.q = null;
    }
    return;
  }
  st.visto = ahora;
  // Si la muñeca no se ve bien (fuera de cuadro o tapada) por un rato, lo más probable es que
  // el brazo esté descansando: vuelve al reposo en vez de quedar a medio levantar.
  if (brazo.inferior) st.munecaVista = ahora;
  else if (ahora - st.munecaVista > 700) {
    fijarEuler(min + 'UpperArm', { x: 0, y: 0, z: lado === 'Left' ? 1.25 : -1.25 });
    fijarHueso(min + 'LowerArm', new THREE.Quaternion());
    fijarHueso(min + 'Hand', new THREE.Quaternion());
    st.q = null;
    return;
  }
  const supObjetivo = brazo.superior.clone().multiply(raiz);
  fijarHueso(min + 'UpperArm', padreMundo.clone().invert().multiply(supObjetivo));
  let qInf = null, antebrazoMundo = null;
  if (brazo.inferior) {
    antebrazoMundo = brazo.inferior.clone().multiply(raiz);
    qInf = supObjetivo.clone().invert().multiply(antebrazoMundo);
  }

  let listo = false;
  if (mano) {
    const dedos = Kalidokit.Hand.solve(mano.lm, lado);
    for (const d of DEDOS) for (const f of FALANGES) {
      fijarEuler(min + (d === 'Thumb' ? PULGAR[f] : d + f), dedos[lado + d + f]);
    }
    const mundo = antebrazoMundo && cuatMundoMano(lado, mano.pts, mano.escala);
    if (mundo) {
      const manoLocal = antebrazoMundo.clone().invert().multiply(mundo.multiply(raiz));
      const { giroAntebrazo, mano: qMano } = repartirGiro(manoLocal);
      fijarHueso(min + 'LowerArm', qInf.clone().multiply(giroAntebrazo));
      fijarHueso(min + 'Hand', qMano);
      listo = true;
    }
  }
  if (!listo && qInf) fijarHueso(min + 'LowerArm', qInf);   // sin mano detectada, la mano mantiene su última orientación
}

// Una mano delante de la cara arruina los puntos faciales: mientras dure, la cabeza
// y la expresión mantienen su último estado bueno.
function manoSobreCara(cuadro) {
  const p = cuadro.cuerpo2d;
  if (!p) return false;
  const nariz = p[0], r = Math.hypot(p[7].x - p[8].x, p[7].y - p[8].y) * 0.8;   // 7 y 8: orejas
  const cerca = (q) => Math.hypot(q.x - nariz.x, q.y - nariz.y) < r;
  for (let i = 15; i <= 22; i++) if (visible(p, i) >= VIS_MIN && cerca(p[i])) return true;
  for (const lado of ['Left', 'Right']) {
    const m = cuadro.manos[lado];
    if (m && m.lm.some(cerca)) return true;
  }
  return false;
}

// Dos manos superpuestas en la imagen: los puntos de la tapada no son confiables.
function manosSuperpuestas(a, b) {
  const caja = (lm) => {
    const xs = lm.map((p) => p.x), ys = lm.map((p) => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const mx = (x1 - x0) * 0.1, my = (y1 - y0) * 0.1;
    return { x0: x0 - mx, x1: x1 + mx, y0: y0 - my, y1: y1 + my };
  };
  const A = caja(a), B = caja(b);
  return A.x0 < B.x1 && B.x0 < A.x1 && A.y0 < B.y1 && B.y0 < A.y1;
}

// Prepara una mano recibida: descarta las cortadas por el borde y elige la escala de sus puntos.
function prepararMano(m, ancho, alto) {
  if (!m || !m.lm || !m.lm.every((p) => enCuadro(p, 0.01))) return null;
  if (m.mundo) return { lm: m.lm, pts: m.mundo, deMundo: true, escala: { x: 1, y: 1, z: 1 } };
  return { lm: m.lm, pts: m.lm, deMundo: false, escala: { x: 1, y: alto / ancho, z: 1 } };
}

// cuadro = { cara, cuerpo2d, cuerpo3d, manos: { Left, Right }, ancho, alto } con lados del personaje
function animar(cuadro) {
  if (!vrm && !titere) return;
  const t = performance.now();
  const tamano = { width: cuadro.ancho || 640, height: cuadro.alto || 480 };
  const manos = {
    Left: prepararMano(cuadro.manos?.Left, tamano.width, tamano.height),
    Right: prepararMano(cuadro.manos?.Right, tamano.width, tamano.height),
  };
  if (manos.Left && manos.Right && manosSuperpuestas(manos.Left.lm, manos.Right.lm)) manos.Left = manos.Right = null;
  cuadro.manos = manos;

  // Cara y torso sirven tanto para el personaje 3D como para el ilustrado.
  let cara = null;
  if (cuadro.cara && !manoSobreCara(cuadro)) {
    cara = Kalidokit.Face.solve(cuadro.cara, { runtime: 'mediapipe', imageSize: tamano }) || null;
    if (cara) for (const k of ['x', 'y', 'z']) cara.head[k] = suavizarValor('cabeza' + k, cara.head[k], t);
  }
  const cuerpo3d = suavizarPuntos('cuerpo', cuadro.cuerpo3d, t);
  const torso = cuadro.cuerpo2d && cuerpo3d ? resolverTorso(cuerpo3d) : null;

  if (titere) { titere.fijar({ cara, torso }); return; }

  for (const lado of ['Left', 'Right']) {
    const m = manos[lado];
    if (!m) continue;
    m.lm = suavizarPuntos('mano' + lado, m.lm, t);
    m.pts = m.deMundo ? suavizarPuntos('manoM' + lado, m.pts, t) : m.lm;
  }
  if (cara) moverCara(cara);
  if (cuadro.cuerpo2d && cuerpo3d) {
    if (torso) {
      const raiz = vrm.humanoid.normalizedHumanBonesRoot.getWorldQuaternion(new THREE.Quaternion());
      const mitad = new THREE.Quaternion().slerp(raiz.clone().invert().multiply(torso).multiply(raiz), 0.5);
      fijarHueso('spine', mitad); fijarHueso('chest', mitad.clone());
    }
    moverBrazo('Left', cuerpo3d, cuadro.cuerpo2d, manos.Left);
    moverBrazo('Right', cuerpo3d, cuadro.cuerpo2d, manos.Right);
  }
}

// ---------- Comunicación con la ventana de seguimiento ----------
let cuadrosSeg = 0, cuadrosDib = 0, msSeg = 0, procesador = '', t0Medidas = performance.now();

puente.recibir('cuadro', (cuadro) => {
  cuadrosSeg++; msSeg += cuadro.ms || 0; procesador = cuadro.procesador || procesador;
  try { animar(cuadro); } catch (e) { console.error('Error al animar: ' + (e.stack || e)); }
});
puente.recibir('estado', (msg) => ponerEstado(msg.texto));

function pedirInicio() { puente.enviar('control', { tipo: 'iniciar', modo: $('modo').value }); }
$('iniciar').addEventListener('click', () => { $('iniciar').disabled = true; pedirInicio(); });
$('modo').addEventListener('change', () => {
  // Al cambiar de modo se sueltan manos y dedos (el modo liviano no los sigue).
  for (const nombre of [...objetivosHueso.keys()]) {
    if (/Hand$|Thumb|Index|Middle|Ring|Little/.test(nombre)) objetivosHueso.set(nombre, new THREE.Quaternion());
  }
  if ($('iniciar').disabled) pedirInicio();
});
$('pausa').addEventListener('change', (e) => puente.enviar('control', { tipo: 'pausa', valor: e.target.checked }));
$('fondo').addEventListener('input', (e) => { if (!texturaFondo) escena.background = new THREE.Color(e.target.value); guardar(); });
for (const id of ['temblor', 'suavizado', 'modo']) $(id).addEventListener('change', () => guardar());

// ---------- Ajustes que se recuerdan entre sesiones ----------
let ajustes = {};
let guardadoPendiente = null;
function guardar(cambios = {}) {
  Object.assign(ajustes, cambios, {
    modo: $('modo').value, temblor: $('temblor').value, suavizado: $('suavizado').value, colorFondo: $('fondo').value,
  });
  clearTimeout(guardadoPendiente);
  guardadoPendiente = setTimeout(() => puente.enviar('guardar-ajustes', ajustes), 300);
}
// Copia un archivo elegido por el usuario a su carpeta de datos, para encontrarlo la próxima vez.
async function conservarArchivo(tipo, archivo) {
  try { return await puente.consultar('guardar-archivo', { tipo, datos: await archivo.arrayBuffer() }); }
  catch (e) { console.error('No se pudo guardar el archivo: ' + (e.message || e)); return false; }
}
async function usarPersonaje(archivo) {
  const formato = formatoDe(archivo.name);
  if (!formato) { ponerEstado('Formato no admitido. Usá un archivo .vrm, .glb o .fbx.'); return; }
  const bien = await cargarPersonaje(URL.createObjectURL(archivo), archivo.name, formato);
  if (bien && await conservarArchivo('personaje', archivo)) guardar({ tipoPersonaje: 'vrm', formatoPersonaje: formato, personaje: archivo.name });
}

// ---------- Personaje ilustrado 2.5D ----------
const cargarImagen = (url) => new Promise((ok, mal) => {
  const img = new Image();
  img.onload = () => ok(img);
  img.onerror = () => mal(new Error('No se pudo leer la imagen'));
  img.src = url;
});
function armarTitere(imagen, marcadores, quitarFondo) {
  const fuente = quitarFondo ? quitarFondoLiso(imagen) : imagen;
  quitarPersonajeActual();
  titere = new Titere2D(fuente, marcadores);
  imagenTitere = imagen;
  escena.add(titere.objeto);
  $('editarTitere').hidden = false;
  ponerEstado('Personaje ilustrado listo.');
  console.log('Personaje ilustrado 2.5D armado');
}

// Editor de marcadores: el usuario indica dónde están la cara, los ojos y la boca.
const editor = { m: null, alTerminar: null };
function dibujarEditor() {
  const marco = $('editorMarco'), m = editor.m, W = marco.clientWidth, H = marco.clientHeight;
  const poner = (clave, x, y) => {
    const asa = marco.querySelector('[data-k="' + clave + '"]');
    asa.style.left = (x * W) + 'px'; asa.style.top = (y * H) + 'px';
  };
  poner('cabeza', m.cabeza.x, m.cabeza.y);
  poner('radio', m.cabeza.x + m.cabeza.r, m.cabeza.y);
  poner('ojoI', m.ojoI.x, m.ojoI.y); poner('ojoD', m.ojoD.x, m.ojoD.y); poner('boca', m.boca.x, m.boca.y);
  const c = $('circuloCabeza'), r = m.cabeza.r * W;
  c.style.left = (m.cabeza.x * W - r) + 'px'; c.style.top = (m.cabeza.y * H - r) + 'px';
  c.style.width = c.style.height = (2 * r) + 'px';
  for (const k of ['ojoI', 'ojoD']) marco.querySelector('[data-k="' + k + '"]').style.display = $('editorOjos').checked ? '' : 'none';
  marco.querySelector('[data-k="boca"]').style.display = $('editorBoca').checked ? '' : 'none';
}
function abrirEditor(imagen, marcadores, quitarFondo, alTerminar) {
  editor.m = JSON.parse(JSON.stringify(marcadores));
  editor.alTerminar = alTerminar;
  $('editorOjos').checked = !!editor.m.usaOjos; $('editorBoca').checked = !!editor.m.usaBoca; $('editorFondo').checked = !!quitarFondo;
  const img = $('editorImg');
  img.onload = () => dibujarEditor();
  img.src = imagen.src;
  $('editor').classList.add('abierto');
  requestAnimationFrame(dibujarEditor);
}
function cerrarEditor() { $('editor').classList.remove('abierto'); editor.alTerminar = null; }
let asaActiva = null;
$('editorMarco').addEventListener('pointerdown', (e) => {
  if (!e.target.dataset || !e.target.dataset.k) return;
  asaActiva = e.target.dataset.k;
  e.target.setPointerCapture(e.pointerId);
});
$('editorMarco').addEventListener('pointermove', (e) => {
  if (!asaActiva) return;
  const caja = $('editorMarco').getBoundingClientRect(), m = editor.m;
  const x = Math.min(1, Math.max(0, (e.clientX - caja.left) / caja.width));
  const y = Math.min(1, Math.max(0, (e.clientY - caja.top) / caja.height));
  if (asaActiva === 'cabeza') {
    // Al mover la cabeza, ojos y boca la acompañan.
    const dx = x - m.cabeza.x, dy = y - m.cabeza.y;
    for (const k of ['cabeza', 'ojoI', 'ojoD', 'boca']) { m[k].x += dx; m[k].y += dy; }
  } else if (asaActiva === 'radio') {
    m.cabeza.r = Math.min(0.5, Math.max(0.03, Math.hypot(x - m.cabeza.x, (y - m.cabeza.y) * caja.height / caja.width)));
  } else { m[asaActiva].x = x; m[asaActiva].y = y; }
  dibujarEditor();
});
window.addEventListener('pointerup', () => { asaActiva = null; });
window.addEventListener('resize', () => { if ($('editor').classList.contains('abierto')) dibujarEditor(); });
for (const id of ['editorOjos', 'editorBoca']) $(id).addEventListener('change', dibujarEditor);
$('editorCancelar').addEventListener('click', cerrarEditor);
$('editorListo').addEventListener('click', () => {
  const m = editor.m, fn = editor.alTerminar;
  m.usaOjos = $('editorOjos').checked; m.usaBoca = $('editorBoca').checked;
  const quitar = $('editorFondo').checked;
  cerrarEditor();
  if (fn) fn(m, quitar);
});

async function usarImagenPersonaje(archivo) {
  let imagen;
  try { imagen = await cargarImagen(URL.createObjectURL(archivo)); }
  catch (e) { ponerEstado('No se pudo leer esa imagen.'); return; }
  abrirEditor(imagen, marcadoresPorDefecto(), !tieneTransparencia(imagen), async (m, quitar) => {
    armarTitere(imagen, m, quitar);
    if (await conservarArchivo('personaje2d', archivo)) {
      guardar({ tipoPersonaje: '2d', personaje: archivo.name, titere: { marcadores: m, quitarFondo: quitar } });
    }
  });
}
$('imagenPersonaje').addEventListener('change', (e) => { if (e.target.files[0]) usarImagenPersonaje(e.target.files[0]); e.target.value = ''; });
$('editarTitere').addEventListener('click', () => {
  if (!imagenTitere || !ajustes.titere) return;
  abrirEditor(imagenTitere, ajustes.titere.marcadores, ajustes.titere.quitarFondo, (m, quitar) => {
    armarTitere(imagenTitere, m, quitar);
    guardar({ titere: { marcadores: m, quitarFondo: quitar } });
  });
});

// Al soltar una imagen se pregunta si es el fondo o el personaje.
let imagenSoltada = null;
function preguntarUso(archivo) { imagenSoltada = archivo; $('elegir').classList.add('abierto'); }
function cerrarPregunta() { $('elegir').classList.remove('abierto'); const a = imagenSoltada; imagenSoltada = null; return a; }
$('elegirPersonaje').addEventListener('click', () => { const a = cerrarPregunta(); if (a) usarImagenPersonaje(a); });
$('elegirFondo').addEventListener('click', () => { const a = cerrarPregunta(); if (a) usarFondo(a); });
$('elegirCancelar').addEventListener('click', cerrarPregunta);
async function usarFondo(archivo) {
  ponerFondoImagen(URL.createObjectURL(archivo));
  if (await conservarArchivo('fondo', archivo)) guardar({ fondoImagen: archivo.name });
}
$('fondoImagen').addEventListener('change', (e) => { if (e.target.files[0]) usarFondo(e.target.files[0]); });
$('quitarFondo').addEventListener('click', () => { quitarFondoImagen(); $('fondoImagen').value = ''; guardar({ fondoImagen: null }); });
$('personajeEjemplo').addEventListener('click', () => { cargarVRM('/recursos/muestra.vrm', 'personaje de ejemplo'); guardar({ tipoPersonaje: 'vrm', personaje: null }); });
window.addEventListener('keydown', (e) => { if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('limpio'); });

// ---------- Cámara virtual ----------
// Cada cuadro dibujado se copia a un lienzo de tamaño fijo (recortando lo que sobra)
// y se manda al proceso principal, que alimenta la cámara "RolCam". El panel de
// controles no forma parte del dibujo, así que nunca sale en la cámara.
let camaraActiva = false, lienzoCam = null, ctxCam = null, ultimoEnvioCam = 0;
function enviarCuadroCamara(ahora) {
  if (!camaraActiva || ahora - ultimoEnvioCam < 1000 / 30 - 3) return;
  ultimoEnvioCam = ahora;
  const origen = renderer.domElement, W = lienzoCam.width, H = lienzoCam.height;
  const aOrigen = origen.width / origen.height, aDestino = W / H;
  let sx = 0, sy = 0, sw = origen.width, sh = origen.height;
  if (aOrigen > aDestino) { sw = origen.height * aDestino; sx = (origen.width - sw) / 2; }
  else { sh = origen.width / aDestino; sy = (origen.height - sh) / 2; }
  ctxCam.drawImage(origen, sx, sy, sw, sh, 0, 0, W, H);
  puente.enviar('camara-cuadro', new Uint8Array(ctxCam.getImageData(0, 0, W, H).data.buffer));
}
function pedirCamara() {
  const [ancho, alto] = $('camCalidad').value.split('x').map(Number);
  lienzoCam = document.createElement('canvas');
  lienzoCam.width = ancho; lienzoCam.height = alto;
  ctxCam = lienzoCam.getContext('2d', { willReadFrequently: true });
  $('camEstado').textContent = 'Iniciando…';
  puente.enviar('camara', { tipo: 'iniciar', ancho, alto });
}
$('camBoton').addEventListener('click', () => { if (camaraActiva) puente.enviar('camara', { tipo: 'detener' }); else pedirCamara(); });
$('camCalidad').addEventListener('change', () => { if (camaraActiva) puente.enviar('camara', { tipo: 'detener' }); });
$('camInstalar').addEventListener('click', () => puente.enviar('camara', { tipo: 'instalar' }));
$('camDesinstalar').addEventListener('click', () => puente.enviar('camara', { tipo: 'desinstalar' }));
puente.recibir('camara-estado', ({ activa, texto }) => {
  camaraActiva = !!activa;
  $('camBoton').textContent = camaraActiva ? 'Detener cámara virtual' : 'Iniciar cámara virtual';
  $('camEstado').textContent = texto || (camaraActiva ? 'Activa.' : 'Apagada.');
});

// ---------- Bucle de dibujo ----------
let tAnterior = performance.now();
function bucle() {
  requestAnimationFrame(bucle);
  const tAhora = performance.now();
  const dt = Math.min((tAhora - tAnterior) / 1000, 0.25);
  tAnterior = tAhora;
  aplicarObjetivos(dt);
  if (vrm) vrm.update(dt);
  if (titere) titere.actualizar(dt, 1 - Math.exp(-dt * (30 - 26 * Number($('suavizado').value))));
  renderer.render(escena, camara);
  enviarCuadroCamara(tAhora);
  cuadrosDib++;
  const ahora = performance.now();
  if (ahora - t0Medidas >= 1000) {
    const seg = (ahora - t0Medidas) / 1000;
    medidasEl.textContent =
      'Dibujo:      ' + (cuadrosDib / seg).toFixed(0) + ' fps\n' +
      'Seguimiento: ' + (cuadrosSeg / seg).toFixed(0) + ' fps' +
      (cuadrosSeg ? '  (' + (msSeg / cuadrosSeg).toFixed(0) + ' ms por cuadro)' : '') +
      (procesador ? '\nSeguimiento en: ' + procesador : '');
    if (puente.prueba) console.log('MEDIDAS dibujo=' + (cuadrosDib / seg).toFixed(0) + ' seguimiento=' + (cuadrosSeg / seg).toFixed(0));
    cuadrosDib = cuadrosSeg = msSeg = 0;
    t0Medidas = ahora;
  }
}
bucle();

// ---------- Arrastrar y soltar un personaje ----------
window.addEventListener('dragover', (e) => { e.preventDefault(); $('soltar').style.display = 'flex'; });
window.addEventListener('dragleave', () => { $('soltar').style.display = 'none'; });
window.addEventListener('drop', (e) => {
  e.preventDefault();
  $('soltar').style.display = 'none';
  const archivo = e.dataTransfer.files[0];
  if (!archivo) return;
  if (archivo.type.startsWith('image/')) preguntarUso(archivo); else usarPersonaje(archivo);
});

// ---------- Arranque: se restaura lo que el usuario dejó ----------
(async () => {
  try { ajustes = (await puente.consultar('leer-ajustes')) || {}; } catch { ajustes = {}; }
  if (ajustes.modo) $('modo').value = ajustes.modo;
  if (ajustes.temblor) $('temblor').value = ajustes.temblor;
  if (ajustes.suavizado) $('suavizado').value = ajustes.suavizado;
  if (ajustes.colorFondo) { $('fondo').value = ajustes.colorFondo; escena.background = new THREE.Color(ajustes.colorFondo); }
  if (ajustes.fondoImagen) ponerFondoImagen('/usuario/fondo.img');
  let restaurado = false;
  if (ajustes.tipoPersonaje === '2d' && ajustes.titere) {
    try {
      armarTitere(await cargarImagen('/usuario/personaje2d.img'), ajustes.titere.marcadores, ajustes.titere.quitarFondo);
      restaurado = true;
    } catch (e) { console.error('No se pudo restaurar el personaje ilustrado: ' + (e.message || e)); }
  }
  if (!restaurado) {
    let bien = false;
    if (ajustes.personaje && ajustes.tipoPersonaje !== '2d') bien = await cargarPersonaje('/usuario/personaje.vrm', ajustes.personaje, ajustes.formatoPersonaje || 'vrm');
    if (!bien) cargarVRM('/recursos/muestra.vrm', 'personaje de ejemplo');
  }
  console.log('Ajustes restaurados: ' + JSON.stringify(ajustes));
})();

// ---------- Prueba automática del personaje ilustrado (ROLCAM_PRUEBA_2D) ----------
if (puente.prueba2d) {
  setTimeout(() => {
    try {
      document.body.classList.add('limpio');
      // Dibujo de prueba: un personaje simple sobre fondo blanco liso.
      const c = document.createElement('canvas'); c.width = 400; c.height = 600;
      const g = c.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 400, 600);
      g.fillStyle = '#3b5fa8'; g.beginPath(); g.moveTo(90, 600); g.lineTo(110, 300); g.quadraticCurveTo(200, 240, 290, 300); g.lineTo(310, 600); g.fill();
      g.fillStyle = '#e8b48c'; g.fillRect(180, 215, 40, 60);
      g.beginPath(); g.arc(200, 150, 80, 0, 7); g.fill();
      g.fillStyle = '#5a3620'; g.beginPath(); g.arc(200, 120, 86, Math.PI, 0); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(170, 150, 14, 10, 0, 0, 7); g.ellipse(230, 150, 14, 10, 0, 0, 7); g.fill();
      g.fillStyle = '#222'; g.beginPath(); g.arc(170, 150, 6, 0, 7); g.arc(230, 150, 6, 0, 7); g.fill();
      g.strokeStyle = '#7a2b2b'; g.lineWidth = 4; g.beginPath(); g.moveTo(180, 195); g.lineTo(220, 195); g.stroke();
      const m = { cabeza: { x: 0.5, y: 0.25, r: 0.2 }, boca: { x: 0.5, y: 0.325 }, ojoI: { x: 0.425, y: 0.25 }, ojoD: { x: 0.575, y: 0.25 }, usaBoca: true, usaOjos: true };
      armarTitere(c, m, true);
      const pose = puente.prueba2d === 'girado'
        ? { head: { x: 0.1, y: 0.6, z: 0.2 }, mouth: { shape: { A: 0.9, E: 0, I: 0, O: 0, U: 0 } }, eye: { l: 0.2, r: 0.2 } }
        : { head: { x: 0, y: 0, z: 0 }, mouth: { shape: { A: 0, E: 0, I: 0, O: 0, U: 0 } }, eye: { l: 1, r: 1 } };
      const torso = puente.prueba2d === 'girado' ? new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.3, 0.15)) : null;
      titere.fijar({ cara: pose, torso });
      console.log('PRUEBA 2D armada (' + puente.prueba2d + ')');
    } catch (e) { console.error('PRUEBA 2D FALLÓ: ' + (e.stack || e)); }
  }, 2500);
}

// ---------- Prueba automática (ROLCAM_PRUEBA=1) ----------
if (puente.prueba && !puente.prueba2d) {
  setTimeout(() => {
    // Cuadro sintético: comprueba que todo el camino puntos -> huesos corre sin errores.
    const p = (x, y, z) => ({ x, y, z, visibility: 1 });
    const cuerpo = Array.from({ length: 33 }, () => p(0.5, 0.5, 0));
    const mundo = Array.from({ length: 33 }, () => p(0, 0, 0));
    cuerpo[0] = p(0.5, 0.2, 0); cuerpo[7] = p(0.55, 0.2, 0); cuerpo[8] = p(0.45, 0.2, 0);
    mundo[11] = p(0.2, -0.4, 0); mundo[13] = p(0.45, -0.3, 0); mundo[15] = p(0.45, -0.5, -0.2);
    mundo[12] = p(-0.2, -0.4, 0); mundo[14] = p(-0.45, -0.3, 0); mundo[16] = p(-0.45, -0.5, -0.2);
    cuerpo[15] = p(0.8, 0.6, 0); cuerpo[16] = p(0.2, 0.6, 0);
    const mano = (cx) => ({ lm: Array.from({ length: 21 }, (_, i) => p(cx + (i % 5) * 0.01, 0.6 + Math.floor(i / 5) * 0.02, i * 0.001)), mundo: null });
    const cara = Array.from({ length: 478 }, (_, i) => p(0.5 + Math.cos(i) * 0.05, 0.2 + Math.sin(i) * 0.07, Math.sin(i * 0.5) * 0.02));
    try {
      animar({ cara, cuerpo2d: cuerpo, cuerpo3d: mundo, manos: { Left: mano(0.2), Right: mano(0.8) }, ancho: 640, alto: 480 });
      console.log('PRUEBA animar OK, objetivos de hueso: ' + objetivosHueso.size);
    } catch (e) { console.error('PRUEBA animar FALLÓ: ' + (e.stack || e)); }
    pedirInicio();
    if (puente.pruebaCamara) pedirCamara();
  }, 4000);
}
