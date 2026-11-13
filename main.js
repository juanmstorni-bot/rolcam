// Proceso principal: crea dos ventanas.
//  - Escenario: dibuja el personaje (es la que se captura para la cámara virtual).
//  - Seguimiento: oculta; abre la webcam y corre MediaPipe en su propio proceso,
//    así el personaje se dibuja fluido aunque el seguimiento vaya lento.
const { app, BrowserWindow, ipcMain, protocol, net, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const RAIZ = __dirname;
const PRUEBA = process.env.ROLCAM_PRUEBA === '1';   // prueba automática sin cámara real

// Los archivos de la app se sirven por app://local/… (contexto seguro: permite cámara, fetch y WASM).
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

// La ventana de seguimiento está oculta: que no se frene por estar en segundo plano.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
if (PRUEBA) {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
}

let escenario = null, seguimiento = null;

// Datos del usuario (ajustes, su personaje y su fondo): fuera de la carpeta del programa.
const carpetaDatos = () => path.join(app.getPath('userData'), 'datos');
const rutaAjustes = () => path.join(carpetaDatos(), 'ajustes.json');
const ARCHIVOS_USUARIO = { personaje: 'personaje.vrm', personaje2d: 'personaje2d.img', fondo: 'fondo.img' };

function leerAjustes() {
  try { return JSON.parse(fs.readFileSync(rutaAjustes(), 'utf8')); } catch { return {}; }
}
function guardarAjustes(ajustes) {
  try {
    fs.mkdirSync(carpetaDatos(), { recursive: true });
    fs.writeFileSync(rutaAjustes(), JSON.stringify(ajustes, null, 2));
  } catch (e) { console.error('No se pudieron guardar los ajustes: ' + e.message); }
}

function reenviarConsola(ventana, nombre) {
  ventana.webContents.on('console-message', (ev) => {
    if (ev && typeof ev.message === 'string') console.log(`[${nombre}] ${ev.message}`);
  });
}

function crearVentanas() {
  const preload = path.join(RAIZ, 'preload.js');

  escenario = new BrowserWindow({
    width: 1280, height: 720, useContentSize: true,
    title: 'RolCam — Escenario', backgroundColor: '#1d2230',
    webPreferences: { preload, backgroundThrottling: false },
  });
  escenario.setMenuBarVisibility(false);
  escenario.loadURL('app://local/src/escenario.html');
  reenviarConsola(escenario, 'escenario');

  seguimiento = new BrowserWindow({
    show: false, width: 640, height: 480,
    webPreferences: { preload, backgroundThrottling: false },
  });
  seguimiento.loadURL('app://local/src/seguimiento.html');
  reenviarConsola(seguimiento, 'seguimiento');

  escenario.on('closed', () => app.quit());
}

app.whenReady().then(() => {
  protocol.handle('app', (pedido) => {
    const pedida = decodeURIComponent(new URL(pedido.url).pathname);
    // /usuario/… apunta a la carpeta de datos del usuario; el resto, a la carpeta del programa.
    const deUsuario = pedida.startsWith('/usuario/');
    const base = deUsuario ? carpetaDatos() : RAIZ;
    const ruta = path.normalize(path.join(base, deUsuario ? pedida.slice('/usuario'.length) : pedida));
    if (!ruta.startsWith(base)) return new Response('Fuera de la app', { status: 403 });
    return net.fetch(pathToFileURL(ruta).toString()).catch(() => new Response('No encontrado', { status: 404 }));
  });

  // Solo se concede el permiso de cámara, y solo a las páginas de la app.
  const esDeLaApp = (url) => typeof url === 'string' && url.startsWith('app://local/');
  session.defaultSession.setPermissionRequestHandler((wc, permiso, responder) => {
    responder(permiso === 'media' && esDeLaApp(wc.getURL()));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permiso, origen) => permiso === 'media' && esDeLaApp(origen + '/'));

  // Mensajes entre ventanas: el proceso principal solo los retransmite.
  ipcMain.on('cuadro', (_e, datos) => { if (escenario && !escenario.isDestroyed()) escenario.webContents.send('cuadro', datos); });
  ipcMain.on('estado', (_e, datos) => { if (escenario && !escenario.isDestroyed()) escenario.webContents.send('estado', datos); });
  ipcMain.on('control', (_e, datos) => { if (seguimiento && !seguimiento.isDestroyed()) seguimiento.webContents.send('control', datos); });

  // Ajustes y archivos del usuario.
  ipcMain.handle('leer-ajustes', () => leerAjustes());
  ipcMain.on('guardar-ajustes', (_e, ajustes) => { if (ajustes && typeof ajustes === 'object') guardarAjustes(ajustes); });
  ipcMain.handle('guardar-archivo', (_e, { tipo, datos }) => {
    const nombre = ARCHIVOS_USUARIO[tipo];
    if (!nombre || !datos) return false;
    fs.mkdirSync(carpetaDatos(), { recursive: true });
    fs.writeFileSync(path.join(carpetaDatos(), nombre), Buffer.from(datos));
    return true;
  });

  crearVentanas();
  if (PRUEBA && process.env.ROLCAM_CAPTURA) {
    setTimeout(async () => {
      const imagen = await escenario.webContents.capturePage();
      fs.writeFileSync(process.env.ROLCAM_CAPTURA, imagen.toPNG());
      console.log('Captura guardada');
    }, Number(process.env.ROLCAM_CAPTURA_MS || 7000));
  }
  if (PRUEBA) setTimeout(() => app.quit(), Number(process.env.ROLCAM_PRUEBA_MS || 20000));
});

app.on('window-all-closed', () => app.quit());
