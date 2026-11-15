// Copia a src/vendor/ los pocos módulos extra de three.js que usa la app (cargadores de
// modelos). Hace falta porque el empaquetador del instalador descarta las carpetas
// "examples" de las dependencias, que es donde three.js guarda estos archivos.
const fs = require('node:fs');
const path = require('node:path');

const ORIGEN = path.join(__dirname, '..', 'node_modules', 'three', 'examples', 'jsm');
const DESTINO = path.join(__dirname, '..', 'src', 'vendor', 'three-addons');
const ARCHIVOS = [
  'loaders/GLTFLoader.js',
  'loaders/FBXLoader.js',
  'utils/BufferGeometryUtils.js',
  'utils/SkeletonUtils.js',
  'curves/NURBSCurve.js',
  'curves/NURBSUtils.js',
  'libs/fflate.module.js',
];

for (const relativo of ARCHIVOS) {
  const destino = path.join(DESTINO, relativo);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.copyFileSync(path.join(ORIGEN, relativo), destino);
}
console.log('Librerías copiadas a src/vendor: ' + ARCHIVOS.length + ' archivos.');
