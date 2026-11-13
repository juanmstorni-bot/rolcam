// Ventana oculta: webcam + MediaPipe. Envía los puntos detectados al escenario.
import { FilesetResolver, HolisticLandmarker, PoseLandmarker, FaceLandmarker } from '@mediapipe/tasks-vision';

const WASM = '/node_modules/@mediapipe/tasks-vision/wasm';
const MODELO_COMPLETO = '/recursos/holistic_landmarker.task';
const MODELO_CUERPO = '/recursos/pose_landmarker_lite.task';
const MODELO_CARA = '/recursos/face_landmarker.task';

const puente = window.puente;
const video = document.getElementById('cam');
const estado = (texto) => puente.enviar('estado', { texto });

let archivos = null, detector = null, activo = false, pausado = false, procesador = '';
let ultimoTiempoVideo = -1;

// Copia liviana de los puntos: solo lo que usa el escenario.
const puntos = (lm) => lm ? lm.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility })) : null;
const mano = (lm, mundo) => lm ? { lm: puntos(lm), mundo: mundo && mundo.length === 21 ? puntos(mundo) : null } : null;

async function crearDetector(modo) {
  archivos = archivos || await FilesetResolver.forVisionTasks(WASM);
  const armar = async (delegate) => {
    const base = (ruta) => ({ baseOptions: { modelAssetPath: ruta, delegate }, runningMode: 'VIDEO' });
    if (modo === 'liviano') {
      const cuerpo = await PoseLandmarker.createFromOptions(archivos, { ...base(MODELO_CUERPO), numPoses: 1 });
      const cara = await FaceLandmarker.createFromOptions(archivos, { ...base(MODELO_CARA), numFaces: 1 });
      return {
        cerrar() { cuerpo.close(); cara.close(); },
        detectar(t) {
          const c = cuerpo.detectForVideo(video, t), f = cara.detectForVideo(video, t);
          return { cara: puntos(f.faceLandmarks?.[0]), cuerpo2d: puntos(c.landmarks?.[0]), cuerpo3d: puntos(c.worldLandmarks?.[0]), manos: {} };
        },
      };
    }
    const completo = await HolisticLandmarker.createFromOptions(archivos, base(MODELO_COMPLETO));
    return {
      cerrar() { completo.close(); },
      detectar(t) {
        const r = completo.detectForVideo(video, t);
        return {
          cara: puntos(r.faceLandmarks?.[0]), cuerpo2d: puntos(r.poseLandmarks?.[0]), cuerpo3d: puntos(r.poseWorldLandmarks?.[0]),
          // Efecto espejo: la mano derecha real mueve la mano izquierda del personaje.
          manos: {
            Left: mano(r.rightHandLandmarks?.[0], r.rightHandWorldLandmarks?.[0]),
            Right: mano(r.leftHandLandmarks?.[0], r.leftHandWorldLandmarks?.[0]),
          },
        };
      },
    };
  };
  try { const d = await armar('GPU'); procesador = 'GPU'; return d; }
  catch (e) { console.warn('GPU no disponible, se usa CPU: ' + (e.message || e)); procesador = 'CPU'; return armar('CPU'); }
}

async function iniciar(modo) {
  activo = false;
  try {
    if (!video.srcObject) {
      estado('Abriendo la cámara…');
      video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, frameRate: 30 }, audio: false });
      await video.play();
    }
    estado('Cargando el modelo de seguimiento…');
    const necesarios = modo === 'liviano' ? [MODELO_CUERPO, MODELO_CARA] : [MODELO_COMPLETO];
    for (const ruta of necesarios) {
      const r = await fetch(ruta, { method: 'HEAD' }).catch(() => null);
      if (!r || !r.ok) { estado('Falta un modelo de seguimiento (' + ruta + '). Cerrá la app y corré: npm run recursos'); return; }
    }
    if (detector) { detector.cerrar(); detector = null; }
    detector = await crearDetector(modo);
    activo = true;
    estado('Seguimiento activo. Ponete de frente, con hombros y manos a la vista.');
  } catch (e) {
    console.error(e);
    estado('No se pudo iniciar el seguimiento: ' + (e.message || e));
  }
}

function ciclo() {
  if (activo && !pausado && video.readyState >= 2 && video.currentTime !== ultimoTiempoVideo) {
    ultimoTiempoVideo = video.currentTime;
    const t0 = performance.now();
    try {
      const cuadro = detector.detectar(t0);
      cuadro.ancho = video.videoWidth; cuadro.alto = video.videoHeight;
      cuadro.ms = performance.now() - t0; cuadro.procesador = procesador;
      puente.enviar('cuadro', cuadro);
    } catch (e) {
      console.error(e);
      activo = false;
      estado('El seguimiento falló: ' + (e.message || e));
    }
  }
  setTimeout(ciclo, 4);
}
ciclo();

puente.recibir('control', (msg) => {
  if (msg.tipo === 'iniciar') iniciar(msg.modo);
  else if (msg.tipo === 'pausa') pausado = !!msg.valor;
});
console.log('Ventana de seguimiento lista');
