// La "sala": conecta el RolCam del Dungeon Master con los de los jugadores usando un código.
// La conexión es directa entre los programas (WebRTC), sin servidor propio. Para que se
// encuentren se usan servidores públicos de mensajes (relés Nostr) a través de la librería
// Trystero; por ahí solo pasa el "apretón de manos", cifrado con el código de la sala.
//
// Qué viaja por la sala:
//   - "perfil": lo que cada uno cuenta de sí mismo (rol, nombre del jugador, personaje).
//   - "mesa":   el estado que fija el Dungeon Master (ambientes encendidos, fondo, vidas).
//   - "efecto": aviso de un sonido que suena una vez.
//   - "archivo": pedido de un archivo al Dungeon Master (imagen de fondo o sonido propio).
//   - la "vista": un video chico del personaje de cada jugador, que solo recibe el Dungeon Master.
//     Es la imagen del personaje ya dibujado; la cámara real del jugador nunca sale de su PC.
import { joinRoom } from 'trystero';

const APP = 'rolcam.juanmstorni-bot.github.io';
const LETRAS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // sin letras ni números que se confunden

export function nuevoCodigo() {
  const azar = crypto.getRandomValues(new Uint8Array(6));
  return [...azar].map((n) => LETRAS[n % LETRAS.length]).join('');
}
export const limpiarCodigo = (texto) => String(texto || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);

export const MESA_VACIA = { ambientes: [], propios: [], fondo: null, vidas: {} };

export class Sala {
  // manejadores: { alCambiarMesa(mesa), alCambiarGente(lista), alEfecto(msg), alError(texto),
  //                alCambiarVistas() }
  constructor(manejadores) {
    this.m = manejadores;
    this.vistas = new Map();      // userId -> MediaStream recibido (solo le llegan al DM)
    this.enviadoA = new Set();    // a qué DM ya se le mandó la vista propia
    this.miVista = null;
    this.room = null; this.yo = null; this.rol = null; this.proveedor = null;
  }
  get conectada() { return !!this.room; }
  get soyDM() { return this.rol === 'dm'; }

  // opciones: ajustes extra de Trystero (solo se usan en las pruebas automáticas).
  async entrar({ codigo, rol, jugador, personaje }, opciones = {}) {
    await this.salir();
    this.rol = rol;
    const room = joinRoom({ appId: APP, password: codigo, ...opciones }, 'mesa-' + codigo);
    this.room = room;
    room.onError((e) => { console.error('Sala: ' + (e && (e.message || e.code) || e)); if (this.m.alError) this.m.alError(String(e && (e.message || e.code) || e)); });

    this.perfil = room.makeUserState('perfil', null);
    this.mesa = room.makeState('mesa', null);
    this.efecto = room.makeAction('efecto');
    this.archivo = room.makeAction('archivo', { kind: 'request' });

    this.yo = (await room.getSelf()).userId;
    if (this.room !== room) return;                       // se salió mientras conectaba

    this.perfil.onChange(() => this._avisarGente());
    room.onUserJoin(() => this._avisarGente());
    room.onUserLeave(() => this._avisarGente());
    this.mesa.onChange((valor) => { if (this.m.alCambiarMesa) this.m.alCambiarMesa(valor || MESA_VACIA); });
    this.efecto.onMessage((dato) => { if (this.m.alEfecto) this.m.alEfecto(dato); });
    room.onPeerStream((stream, { userId, metadata }) => {
      if (!metadata || metadata.tipo !== 'personaje') return;
      this.vistas.set(userId, stream);
      if (this.m.alCambiarVistas) this.m.alCambiarVistas();
    });
    this.archivo.onRequest(async (pedido) => {
      if (!this.proveedor) throw new Error('Este participante no comparte archivos');
      return this.proveedor(pedido);
    });

    await this.perfil.set({ rol, jugador: jugador || '', personaje: personaje || '' });
    if (rol === 'dm' && !this.mesa.get()) await this.mesa.set({ ...MESA_VACIA });
    this._avisarGente();
  }

  async salir() {
    const room = this.room;
    this.room = null; this.yo = null;
    this.vistas.clear(); this.enviadoA.clear(); this.miVista = null;
    if (room) { try { await room.leave(); } catch (e) { console.error('Sala (al salir): ' + (e.message || e)); } }
  }

  // Todos los que están en la sala: [{ userId, rol, jugador, personaje, yo }]
  gente() {
    if (!this.room) return [];
    const todos = this.perfil.getAll();
    return Object.entries(todos).filter(([, p]) => p).map(([userId, p]) => ({ userId, ...p, yo: userId === this.yo }));
  }
  _avisarGente() {
    if (!this.room) return;
    // Se olvidan las vistas de quienes ya se fueron.
    const presentes = new Set(this.gente().map((p) => p.userId));
    let cambio = false;
    for (const id of [...this.vistas.keys()]) if (!presentes.has(id)) { this.vistas.delete(id); cambio = true; }
    for (const id of [...this.enviadoA]) if (!presentes.has(id)) this.enviadoA.delete(id);
    this._repartirVista();
    if (this.m.alCambiarGente) this.m.alCambiarGente(this.gente());
    if (cambio && this.m.alCambiarVistas) this.m.alCambiarVistas();
  }

  // --- La vista del personaje (jugador -> Dungeon Master) ---
  // El jugador entrega un video de su personaje; se le manda solo a quien sea Dungeon Master,
  // también si entra más tarde.
  compartirVista(stream) { this.miVista = stream; this.enviadoA.clear(); this._repartirVista(); }
  _repartirVista() {
    if (!this.room || !this.miVista || this.soyDM) return;
    for (const p of this.gente()) {
      if (p.rol !== 'dm' || p.yo || this.enviadoA.has(p.userId)) continue;
      this.enviadoA.add(p.userId);
      Promise.resolve(this.room.addStream(this.miVista, { target: p.userId, metadata: { tipo: 'personaje' } }))
        .catch((e) => { this.enviadoA.delete(p.userId); console.error('Sala (vista): ' + (e.message || e)); });
    }
  }

  actualizarPerfil(cambios) {
    if (!this.room) return;
    return this.perfil.set((previo) => ({ ...(previo || {}), ...cambios }));
  }

  // --- Solo el Dungeon Master ---
  leerMesa() { return (this.room && this.mesa.get()) || MESA_VACIA; }
  fijarMesa(cambiar) {
    if (!this.room || !this.soyDM) return;
    return this.mesa.set((previa) => cambiar({ ...MESA_VACIA, ...(previa || {}) }));
  }
  enviarEfecto(dato) { if (this.room && this.soyDM) return this.efecto.send(dato); }
  // proveedor(pedido) devuelve los bytes (Uint8Array) del archivo pedido.
  ofrecerArchivos(proveedor) { this.proveedor = proveedor; }

  // --- Los jugadores ---
  // Pide un archivo al Dungeon Master: { que: 'fondo' } o { que: 'audio', n }.
  async pedirArchivo(pedido) {
    const dm = this.gente().find((p) => p.rol === 'dm' && !p.yo);
    if (!dm) throw new Error('No hay un Dungeon Master en la sala');
    return this.archivo.request(pedido, { target: dm.userId, timeoutMs: 30000 });
  }
}
