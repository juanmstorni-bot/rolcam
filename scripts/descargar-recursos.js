// Descarga una sola vez los modelos de seguimiento y un personaje de ejemplo a recursos/.
// Después de esto la app funciona sin internet.
const fs = require('node:fs');
const path = require('node:path');

const DESTINO = path.join(__dirname, '..', 'recursos');
const MODELOS = 'https://storage.googleapis.com/mediapipe-models/';
const ARCHIVOS = [
  ['holistic_landmarker.task', MODELOS + 'holistic_landmarker/holistic_landmarker/float16/latest/holistic_landmarker.task'],
  ['pose_landmarker_lite.task', MODELOS + 'pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task'],
  ['face_landmarker.task', MODELOS + 'face_landmarker/face_landmarker/float16/latest/face_landmarker.task'],
  ['muestra.vrm', 'https://raw.githubusercontent.com/pixiv/three-vrm/dev/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm'],
];

(async () => {
  fs.mkdirSync(DESTINO, { recursive: true });
  let fallas = 0;
  for (const [nombre, url] of ARCHIVOS) {
    const ruta = path.join(DESTINO, nombre);
    if (fs.existsSync(ruta) && fs.statSync(ruta).size > 0) { console.log('Ya está: ' + nombre); continue; }
    try {
      process.stdout.write('Descargando ' + nombre + '… ');
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const datos = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(ruta, datos);
      console.log((datos.length / 1048576).toFixed(1) + ' MB');
    } catch (e) {
      fallas++;
      console.log('falló (' + e.message + ')');
    }
  }
  if (fallas) console.log('\nFaltan ' + fallas + ' archivo(s). Revisá la conexión y corré: npm run recursos');
  else console.log('\nRecursos listos.');
})();
