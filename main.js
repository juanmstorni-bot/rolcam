// Proceso principal: crea dos ventanas.
//  - Escenario: dibuja el personaje (es la que se captura para la cámara virtual).
//  - Seguimiento: oculta; abre la webcam y corre MediaPipe en su propio proceso,
//    así el personaje se dibuja fluido aunque el seguimiento vaya lento.
const { app, BrowserWindow, ipcMain, protocol, net, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');

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

  // Prueba automática de la sala: una segunda ventana hace de jugador.
  if (process.env.ROLCAM_PRUEBA_SALA) {
    const jugador = new BrowserWindow({ width: 900, height: 600, webPreferences: { preload, backgroundThrottling: false } });
    jugador.loadURL('app://local/src/escenario.html?jugador=1');
    reenviarConsola(jugador, 'jugador');
  }
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

  // ---------- Cámara virtual ----------
  // El escenario manda cada cuadro (RGBA); acá se reenvía al programa auxiliar
  // nativo/bin/x64/rolcam-camara.exe, que alimenta la cámara virtual "RolCam".
  const BIN = path.join(RAIZ, 'nativo', 'bin');
  const FALSA = process.env.ROLCAM_CAMARA_FALSA || '';      // solo para pruebas automáticas
  let camara = null, camaraLlena = false, bytesPorCuadro = 0;
  const avisarCamara = (activa, texto) => { if (escenario && !escenario.isDestroyed()) escenario.webContents.send('camara-estado', { activa, texto }); };

  function detenerCamara(texto = 'Cámara virtual apagada.') {
    if (camara && camara.proceso) { try { camara.proceso.stdin.end(); } catch {} }
    camara = null; camaraLlena = false;
    avisarCamara(false, texto);
  }

  function iniciarCamara(ancho, alto) {
    if (camara) return;
    ancho = Number(ancho) || 1280; alto = Number(alto) || 720;
    bytesPorCuadro = ancho * alto * 4;
    if (FALSA) { camara = { falsa: true, cuadros: 0, ancho, alto }; avisarCamara(true, 'Cámara virtual de prueba activa.'); return; }
    if (process.platform !== 'win32') { avisarCamara(false, 'La cámara virtual solo funciona en Windows.'); return; }
    const exe = path.join(BIN, 'x64', 'rolcam-camara.exe');
    if (!fs.existsSync(exe)) { avisarCamara(false, 'Falta el componente de cámara virtual (carpeta nativo/bin). Mirá el README.'); return; }
    const proceso = spawn(exe, [String(ancho), String(alto)], { cwd: path.dirname(exe), stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
    camara = { proceso };
    let error = '';
    proceso.stderr.on('data', (d) => {
      const t = String(d);
      if (t.includes('LISTO')) avisarCamara(true, 'Cámara virtual activa. En Discord elegí la cámara "RolCam".');
      if (t.includes('ERROR ocupada')) error = 'La cámara virtual ya está en uso por otra ventana de RolCam.';
      if (t.includes('ERROR tamano')) error = 'Tamaño de cámara no válido.';
    });
    proceso.stdin.on('drain', () => { camaraLlena = false; });
    proceso.stdin.on('error', () => {});
    proceso.on('error', (e) => { camara = null; avisarCamara(false, 'No se pudo iniciar la cámara virtual: ' + e.message); });
    proceso.on('exit', (codigo) => {
      if (camara && camara.proceso === proceso) camara = null;
      avisarCamara(false, error || (codigo ? 'La cámara virtual se cerró. ¿Está instalada en Windows? Usá "Instalar cámara virtual".' : 'Cámara virtual apagada.'));
    });
  }

  // Registra (o quita) la cámara en Windows. El instalador de Softcam necesita permisos de
  // administrador, así que se lanza "elevado" con PowerShell (aparece el aviso de Windows).
  function ejecutarElevado(exe, argumentos) {
    return new Promise((resolver) => {
      const comilla = (t) => "'" + String(t).replace(/'/g, "''") + "'";
      const lista = argumentos.map((a) => comilla('"' + a + '"')).join(',');
      const orden = 'Start-Process -FilePath ' + comilla(exe) + ' -ArgumentList ' + lista + ' -Verb RunAs -Wait';
      const ps = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', orden], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
      let error = '';
      ps.stderr.on('data', (d) => { error += String(d); });
      ps.on('error', (e) => resolver(e.message));
      ps.on('exit', (codigo) => resolver(codigo === 0 && !error ? null : (error.trim() || 'código ' + codigo)));
    });
  }
  async function registrarCamara(accion) {
    if (process.platform !== 'win32') { avisarCamara(false, 'La cámara virtual solo funciona en Windows.'); return; }
    const pasos = [];
    for (const arq of ['x64', 'x86']) {
      const instalador = path.join(BIN, arq, 'softcam_installer.exe'), dll = path.join(BIN, arq, 'softcam.dll');
      if (fs.existsSync(instalador) && fs.existsSync(dll)) pasos.push([instalador, dll]);
    }
    if (!pasos.length) { avisarCamara(false, 'Falta el componente de cámara virtual (carpeta nativo/bin). Mirá el README.'); return; }
    avisarCamara(false, 'Aceptá el permiso de administrador que pide Windows (dos veces) y los carteles de confirmación…');
    for (const [instalador, dll] of pasos) {
      const error = await ejecutarElevado(instalador, [accion, dll]);
      if (error) {
        console.error('Instalador de cámara: ' + error);
        avisarCamara(false, 'No se completó. Si cancelaste el permiso de Windows, volvé a intentarlo.');
        return;
      }
    }
    avisarCamara(false, accion === 'register'
      ? 'Cámara instalada. Tocá "Iniciar cámara virtual" y reiniciá Discord para que la vea.'
      : 'Cámara desinstalada.');
  }

  ipcMain.on('camara', (_e, msg) => {
    if (!msg) return;
    if (msg.tipo === 'iniciar') iniciarCamara(msg.ancho, msg.alto);
    else if (msg.tipo === 'detener') detenerCamara();
    else if (msg.tipo === 'instalar') registrarCamara('register');
    else if (msg.tipo === 'desinstalar') { detenerCamara(); registrarCamara('unregister'); }
  });
  ipcMain.on('camara-cuadro', (_e, datos) => {
    if (!camara || !datos || datos.byteLength !== bytesPorCuadro) return;
    if (camara.falsa) {
      // Prueba: guarda el quinto cuadro como imagen PPM para poder mirarlo.
      if (++camara.cuadros === 5) {
        const rgb = Buffer.alloc(camara.ancho * camara.alto * 3);
        for (let i = 0, j = 0; i < datos.length; i += 4) { rgb[j++] = datos[i]; rgb[j++] = datos[i + 1]; rgb[j++] = datos[i + 2]; }
        fs.writeFileSync(FALSA, Buffer.concat([Buffer.from('P6\n' + camara.ancho + ' ' + camara.alto + '\n255\n'), rgb]));
        console.log('Cámara de prueba: cuadro guardado');
      }
      return;
    }
    if (camaraLlena || !camara.proceso) return;     // si el auxiliar va atrasado, se saltea el cuadro
    camaraLlena = !camara.proceso.stdin.write(Buffer.from(datos.buffer, datos.byteOffset, datos.byteLength));
  });
  app.on('before-quit', () => { if (camara && camara.proceso) { try { camara.proceso.stdin.end(); } catch {} } });

  // Ajustes y archivos del usuario.
  ipcMain.handle('leer-ajustes', () => leerAjustes());
  ipcMain.on('guardar-ajustes', (_e, ajustes) => { if (ajustes && typeof ajustes === 'object') guardarAjustes(ajustes); });
  ipcMain.handle('guardar-archivo', (_e, { tipo, datos }) => {
    // Los sonidos propios del Dungeon Master van en archivos numerados (sonido1 … sonido99).
    const casillero = /^sonido([1-9][0-9]?)$/.exec(String(tipo));
    const nombre = casillero ? 'sonido-' + casillero[1] + '.bin' : ARCHIVOS_USUARIO[tipo];
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
