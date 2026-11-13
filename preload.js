// Puente mínimo entre las páginas y el proceso principal.
const { contextBridge, ipcRenderer } = require('electron');

const CANALES = ['cuadro', 'estado', 'control', 'guardar-ajustes'];
const CONSULTAS = ['leer-ajustes', 'guardar-archivo'];

contextBridge.exposeInMainWorld('puente', {
  enviar(canal, datos) { if (CANALES.includes(canal)) ipcRenderer.send(canal, datos); },
  recibir(canal, fn) { if (CANALES.includes(canal)) ipcRenderer.on(canal, (_e, datos) => fn(datos)); },
  consultar(canal, datos) { return CONSULTAS.includes(canal) ? ipcRenderer.invoke(canal, datos) : Promise.reject(new Error('Canal no permitido')); },
  prueba2d: process.env.ROLCAM_PRUEBA_2D || '',
  prueba: process.env.ROLCAM_PRUEBA === '1',
});
