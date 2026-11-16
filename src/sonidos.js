// Sonidos del panel del Dungeon Master.
// Los ambientes y efectos incluidos se GENERAN por código (ruido filtrado y tonos), así que
// no hay archivos de audio de terceros ni licencias que revisar. Su carácter (qué graves,
// qué ritmo, cuánto duran) se ajustó midiendo grabaciones de referencia, sin copiarlas.
// Además se pueden cargar sonidos propios desde archivos.

let ctx = null, salida = null, ruidoBlanco = null, ruidoMarron = null, fueraDeLinea = false;

// Prepara el motor sobre un contexto de audio. En la app se crea solo; en las pruebas se le
// pasa un OfflineAudioContext para poder grabar cada sonido a un archivo y medirlo.
export function usarContexto(contexto) {
  ctx = contexto;
  fueraDeLinea = typeof ctx.startRendering === 'function';
  salida = ctx.createGain();
  salida.gain.value = fueraDeLinea ? 1 : 0.8;
  salida.connect(ctx.destination);
  const n = Math.floor(ctx.sampleRate * 4);
  ruidoBlanco = ctx.createBuffer(1, n, ctx.sampleRate);
  ruidoMarron = ctx.createBuffer(1, n, ctx.sampleRate);
  const b = ruidoBlanco.getChannelData(0), m = ruidoMarron.getChannelData(0);
  let acumulado = 0;
  for (let i = 0; i < n; i++) {
    const r = Math.random() * 2 - 1;
    b[i] = r;
    acumulado = (acumulado + 0.02 * r) / 1.02;       // ruido marrón: más grave y suave
    m[i] = acumulado * 3.5;
  }
}
function asegurarContexto() {
  if (!ctx) usarContexto(new AudioContext());
  else if (ctx.state === 'suspended') ctx.resume();
}

export function volumenGeneral(v) { asegurarContexto(); salida.gain.setTargetAtTime(v, ctx.currentTime, 0.05); }

// ---------- Piezas ----------
const azar = (a, b) => a + Math.random() * (b - a);
function ganancia(valor, destino) { const g = ctx.createGain(); g.gain.value = valor; g.connect(destino); return g; }
function filtro(tipo, frecuencia, destino, q = 0.7, dB = 0) {
  const f = ctx.createBiquadFilter();
  f.type = tipo; f.frequency.value = frecuencia; f.Q.value = q; f.gain.value = dB;
  f.connect(destino);
  return f;
}
function ruidoEnBucle(buffer, destino) {
  const f = ctx.createBufferSource();
  f.buffer = buffer; f.loop = true;
  f.connect(destino);
  f.start(0, Math.random() * buffer.duration);
  return f;
}
// Un trozo de ruido de duración fija, que empieza en el instante t.
function rafaga(buffer, destino, t, dur) {
  const f = ctx.createBufferSource();
  f.buffer = buffer; f.loop = true;
  f.connect(destino);
  f.start(t, Math.random() * buffer.duration);
  f.stop(t + dur);
  return f;
}
function tono(tipo, frecuencia, destino, t, dur) {
  const o = ctx.createOscillator();
  o.type = tipo; o.frequency.value = frecuencia;
  o.connect(destino); o.start(t);
  if (dur) o.stop(t + dur);
  return o;
}
// Oscilador lento que mueve un parámetro (volumen, frecuencia de un filtro…).
function vaiven(parametro, hz, profundidad) {
  const g = ctx.createGain(); g.gain.value = profundidad; g.connect(parametro);
  return tono('sine', hz, g, 0);
}
// Sube rápido y baja exponencialmente: la forma de casi todos los golpes.
function golpeDeVolumen(param, t, pico, ataque, caida) {
  param.setValueAtTime(0.0001, t);
  param.exponentialRampToValueAtTime(Math.max(pico, 0.0002), t + ataque);
  param.exponentialRampToValueAtTime(0.0001, t + ataque + caida);
}

// Programa sucesos (chasquidos, truenos, golpes de tambor) con el reloj del audio, un poco por
// adelantado, para que el ritmo no dependa de lo ocupada que esté la ventana.
// siguiente(t) recibe el instante del suceso y devuelve cuántos segundos faltan para el próximo.
function programar(primerRetraso, siguiente) {
  let proximo = ctx.currentTime + primerRetraso, vivo = true, id = null;
  const hasta = () => (fueraDeLinea ? ctx.length / ctx.sampleRate : ctx.currentTime + 0.6);
  const avanzar = () => { while (vivo && proximo < hasta()) proximo += Math.max(0.01, siguiente(proximo)); };
  avanzar();
  if (!fueraDeLinea) id = setInterval(avanzar, 200);
  return () => { vivo = false; clearInterval(id); };
}

// ---------- Efectos de una sola vez ----------
// Trueno: estallido seco, retumbo grave que se apaga, y un segundo retumbo más tarde.
function trueno(destino, t, fuerza = 1) {
  const g = ganancia(0, destino), paso = filtro('lowpass', 900, g, 0.5);
  rafaga(ruidoMarron, paso, t, 6.2);
  paso.frequency.setValueAtTime(3200, t);
  paso.frequency.exponentialRampToValueAtTime(600, t + 1.4);
  paso.frequency.exponentialRampToValueAtTime(190, t + 5.5);
  // Envolvente irregular: el retumbo real sube y baja al azar.
  const pasos = 124, curva = new Float32Array(pasos), segundo = azar(2.0, 2.8);
  for (let i = 0; i < pasos; i++) {
    const s = i * 6.2 / (pasos - 1);
    const primero = Math.exp(-s / 1.1);
    const eco = s > segundo ? 0.95 * Math.exp(-(s - segundo) / 0.9) * Math.min(1, (s - segundo) / 0.08) : 0;
    const cola = 0.12 * Math.exp(-s / 2.2);
    curva[i] = (primero + eco + cola) * (0.7 + 0.6 * Math.random()) * 0.9 * fuerza * Math.min(1, s / 0.03 + 0.02) * Math.max(0, 1 - Math.max(0, s - 5.4) / 0.8);
  }
  curva[0] = 0; curva[pasos - 1] = 0;
  g.gain.setValueCurveAtTime(curva, t, 6.2);
  // El chasquido inicial, más agudo y muy corto.
  const gc = ganancia(0, destino), pc = filtro('lowpass', 1800, gc, 0.5);
  rafaga(ruidoBlanco, pc, t, 1.6);
  golpeDeVolumen(gc.gain, t, 0.5 * fuerza, 0.01, 1.4);
}

// Campana grave y oscura, con un apagado muy largo.
const PARCIALES_CAMPANA = [[120, 0.2, 9], [154, 0.6, 8.5], [257, 1.0, 7.5], [295, 0.2, 6], [384, 0.7, 6.5], [521, 0.8, 6], [679, 0.95, 5.5], [839, 0.95, 5], [1172, 1.3, 5]];
function campana(destino, t) {
  const g = ganancia(0.08, destino);
  for (const [f, vol, dur] of PARCIALES_CAMPANA) {
    for (const desafine of [0, 0.6]) {                    // dos tonos casi iguales: el "batido" de las campanas
      const gp = ganancia(0, g);
      tono('sine', f + desafine * (0.5 + f / 600), gp, t, dur + 0.2);
      golpeDeVolumen(gp.gain, t, vol * (desafine ? 0.5 : 1), 0.012, dur);
    }
  }
  const gr = ganancia(0, g), pr = filtro('bandpass', 700, gr, 0.8);     // el golpe del badajo
  rafaga(ruidoBlanco, pr, t, 0.12);
  golpeDeVolumen(gr.gain, t, 0.9, 0.004, 0.09);
}

// Magia misteriosa: un acorde grave que crece, da paso a un acorde medio y termina en un brillo agudo.
function hechizo(destino, t) {
  const g = ganancia(0.42, destino), tremolo = ganancia(1, g);
  const lento = ctx.createGain(); lento.gain.value = 0.18; lento.connect(tremolo.gain);
  tono('sine', 5.2, lento, t, 5.4);
  const capa = (frecuencias, tipo, inicio, pico, fin, vol, corte = 1400) => {
    const gc = ganancia(0, tremolo), paso = filtro('lowpass', corte, gc);
    gc.gain.setValueAtTime(0.0001, t + inicio);
    gc.gain.exponentialRampToValueAtTime(vol, t + pico);
    gc.gain.exponentialRampToValueAtTime(0.0001, t + fin);
    frecuencias.forEach((f, i) => {
      const o = tono(tipo, f, paso, t + inicio, fin - inicio + 0.1);
      o.detune.setValueAtTime(-12 + 6 * i, t + inicio);
      o.detune.linearRampToValueAtTime(14 - 5 * i, t + fin);          // deriva lenta: suena "vivo"
    });
  };
  capa([137, 166, 184, 208], 'sine', 0, 0.9, 3.4, 0.7);
  capa([104], 'sine', 0, 0.9, 3.0, 0.12);
  capa([289, 333, 375, 419, 500], 'triangle', 0.5, 2.4, 4.8, 0.5);
  capa([2183, 2200, 2933], 'sine', 2.2, 3.8, 5.2, 0.075, 9000);
  const gs = ganancia(0, g), ps = filtro('bandpass', 350, gs, 3);    // soplo que sube
  rafaga(ruidoBlanco, ps, t, 5.2);
  ps.frequency.setValueAtTime(260, t); ps.frequency.exponentialRampToValueAtTime(900, t + 4.8);
  gs.gain.setValueAtTime(0.0001, t); gs.gain.exponentialRampToValueAtTime(0.5, t + 1.5); gs.gain.exponentialRampToValueAtTime(0.0001, t + 5);
}

// ---------- Sucesos sueltos de los ambientes ----------
function chasquido(destino, t) {
  const grande = Math.random() < 0.12;
  const g = ganancia(0, destino), p = filtro('highpass', grande ? 1200 : azar(2200, 4500), g);
  rafaga(ruidoBlanco, p, t, 0.08);
  golpeDeVolumen(g.gain, t, (grande ? 1.1 : 0.12 + 0.9 * Math.random() ** 3), 0.001, grande ? azar(0.02, 0.05) : azar(0.004, 0.02));
}
// Gota de lluvia que pega contra el piso: un "tic" muy corto; una de cada tantas es más gorda y grave.
function gotaLluvia(destino, t) {
  const gorda = Math.random() < 0.16;
  const g = ganancia(0, destino), p = filtro('bandpass', gorda ? azar(450, 1300) : azar(2400, 7500), g, gorda ? 2.5 : 1.4);
  rafaga(ruidoBlanco, p, t, 0.06);
  golpeDeVolumen(g.gain, t, (gorda ? 1.3 : 0.75) * azar(0.25, 1), 0.001, gorda ? azar(0.015, 0.04) : azar(0.004, 0.012));
}
// Rayo: varios chasquidos secos y agudos muy seguidos, y enseguida el trueno.
function rayo(destino, t, fuerza = 1) {
  const chasquidos = 3 + Math.floor(Math.random() * 4);
  let cuando = t;
  for (let i = 0; i < chasquidos; i++) {
    const g = ganancia(0, destino), p = filtro('highpass', azar(1400, 2600), g);
    rafaga(ruidoBlanco, p, cuando, 0.12);
    golpeDeVolumen(g.gain, cuando, 0.55 * fuerza * azar(0.5, 1), 0.001, azar(0.03, 0.09));
    cuando += azar(0.02, 0.08);
  }
  trueno(destino, cuando + azar(0.1, 0.8), fuerza);
}
// Tambor: tono grave que cae, más el golpe del parche.
function tambor(destino, t, fuerza, grave) {
  const f0 = grave ? azar(62, 70) : azar(98, 112);
  const g = ganancia(0, destino), o = tono('sine', f0 * 1.5, g, t, grave ? 0.9 : 0.5);
  o.frequency.setValueAtTime(f0 * 1.5, t); o.frequency.exponentialRampToValueAtTime(grave ? 41 : f0 * 0.82, t + (grave ? 0.12 : 0.09));
  golpeDeVolumen(g.gain, t, fuerza * (grave ? 1.3 : 0.8), 0.004, grave ? 0.7 : 0.32);
  const gr = ganancia(0, destino), pr = filtro('lowpass', grave ? 1500 : 3200, gr);
  rafaga(ruidoBlanco, pr, t, 0.12);
  golpeDeVolumen(gr.gain, t, fuerza * (grave ? 1.0 : 0.9), 0.002, grave ? 0.09 : 0.06);
  const g2 = ganancia(0, destino);                       // armónico del parche: le da cuerpo en los medios
  tono('triangle', f0 * 2.4, g2, t, 0.3);
  golpeDeVolumen(g2.gain, t, fuerza * 0.6, 0.003, grave ? 0.2 : 0.14);
}

// ---------- Ambientes en bucle ----------
// Cada uno recibe su nodo de volumen y devuelve una función que lo apaga.
const AMBIENTES = {
  lluvia: { nombre: 'Lluvia', armar(d) {
    // Un fondo brillante y parejo, y encima las gotas sueltas que pegan contra el piso.
    const gg = ganancia(1.6, d);
    const pararGotas = programar(0.02, (t) => { gotaLluvia(gg, t); return azar(0.006, 0.055); });
    const g = ganancia(0.085, d), a = filtro('lowpass', 11000, g), b = filtro('peaking', 5500, a, 0.8, 2.5), c = filtro('peaking', 900, b, 0.6, 4), c2 = filtro('highpass', 140, c);
    const f1 = ruidoEnBucle(ruidoBlanco, c2), l1 = vaiven(g.gain, 0.17, 0.035), l2 = vaiven(g.gain, 0.61, 0.02);
    const g2 = ganancia(0.13, d), f2 = ruidoEnBucle(ruidoMarron, filtro('lowpass', 300, g2));
    return () => { f1.stop(); f2.stop(); l1.stop(); l2.stop(); pararGotas(); };
  } },
  viento: { nombre: 'Viento fuerte', armar(d) {
    // Casi todo grave (60–250 Hz), con ráfagas que van y vienen.
    const g = ganancia(0.42, d), a = filtro('lowpass', 420, g, 0.5), b = filtro('highpass', 55, a, 0.7);
    const f1 = ruidoEnBucle(ruidoMarron, b);
    const l1 = vaiven(g.gain, 0.31, 0.16), l2 = vaiven(g.gain, 0.073, 0.1), l3 = vaiven(g.gain, 2.3, 0.04);
    const g2 = ganancia(0.07, d), silbido = filtro('bandpass', 900, g2, 0.6), f2 = ruidoEnBucle(ruidoBlanco, silbido);
    const l4 = vaiven(silbido.frequency, 0.19, 250), l5 = vaiven(g2.gain, 0.31, 0.04);
    return () => { [f1, f2, l1, l2, l3, l4, l5].forEach((n) => n.stop()); };
  } },
  fogata: { nombre: 'Fogata', armar(d) {
    // Rugido muy grave, un siseo agudo leve y muchos chasquidos secos.
    const g = ganancia(0.05, d), f1 = ruidoEnBucle(ruidoMarron, filtro('lowpass', 130, g)), l1 = vaiven(g.gain, 0.4, 0.015);
    const g2 = ganancia(0.012, d), f2 = ruidoEnBucle(ruidoBlanco, filtro('bandpass', 5000, g2, 0.5));
    const gc = ganancia(0.6, d);
    const parar = programar(0.05, (t) => { chasquido(gc, t); return azar(0.02, 0.34); });
    return () => { f1.stop(); f2.stop(); l1.stop(); parar(); };
  } },
  tormenta: { nombre: 'Tormenta', armar(d) {
    // Aguacero denso (cuerpo en 125–500 Hz), siseo de lluvia, y rayos con truenos.
    const g = ganancia(0.7, d), a = filtro('lowpass', 400, g, 0.8), b = filtro('highpass', 150, a, 0.8), f1 = ruidoEnBucle(ruidoBlanco, b);
    const g2 = ganancia(0.018, d), f2 = ruidoEnBucle(ruidoBlanco, filtro('bandpass', 2500, g2, 0.5));
    const g3 = ganancia(0.1, d), f3 = ruidoEnBucle(ruidoMarron, filtro('lowpass', 110, g3)), l1 = vaiven(g.gain, 0.21, 0.08);
    const gt = ganancia(1.5, d);
    // Rayo con su trueno cada tanto; a veces solo un trueno lejano.
    const parar = programar(azar(1.5, 3.5), (t) => {
      if (Math.random() < 0.7) rayo(gt, t, azar(0.7, 1)); else trueno(gt, t, azar(0.4, 0.7));
      return azar(6, 14);
    });
    return () => { f1.stop(); f2.stop(); f3.stop(); l1.stop(); parar(); };
  } },
  tambores: { nombre: 'Tambores de guerra', armar(d) {
    // Tambores graves al galope, con algo de sala para que suenen grandes.
    const seco = ganancia(0.5, d), sala = ganancia(0.3, d), pasoSala = filtro('lowpass', 1600, sala);
    const r1 = ctx.createDelay(1), r2 = ctx.createDelay(1), vuelta1 = ctx.createGain(), vuelta2 = ctx.createGain();
    r1.delayTime.value = 0.093; r2.delayTime.value = 0.141; vuelta1.gain.value = 0.38; vuelta2.gain.value = 0.34;
    r1.connect(vuelta1); vuelta1.connect(r2); r2.connect(vuelta2); vuelta2.connect(r1);
    r1.connect(pasoSala); r2.connect(pasoSala);
    const entrada = ctx.createGain(); entrada.connect(seco); entrada.connect(r1);
    const pulso = 0.4;
    // [tiempo en pulsos, fuerza, grave]: compás de 8 pulsos que se repite.
    const compas = [[0, 1, 1], [0.5, 0.5, 0], [0.75, 0.55, 0], [1, 0.8, 0], [1.5, 0.6, 0], [2, 0.9, 1], [2.5, 0.5, 0], [2.75, 0.55, 0], [3, 0.8, 0], [3.5, 0.5, 0], [3.75, 0.6, 0],
      [4, 1, 1], [4.5, 0.5, 0], [4.75, 0.55, 0], [5, 0.8, 0], [5.5, 0.85, 1], [6, 0.95, 1], [6.5, 0.6, 0], [7, 0.55, 0], [7.25, 0.6, 0], [7.5, 0.7, 0], [7.75, 0.8, 0]];
    const parar = programar(0.1, (t) => {
      for (const [p, fuerza, grave] of compas) tambor(entrada, t + p * pulso + azar(-0.008, 0.008), fuerza * azar(0.85, 1.1), !!grave);
      return 8 * pulso;
    });
    return () => { parar(); setTimeout(() => entrada.disconnect(), 100); };
  } },
};

const EFECTOS = {
  trueno: { nombre: 'Trueno', tocar: (d, t) => trueno(d, t, 1) },
  campana: { nombre: 'Campana', tocar: (d, t) => campana(d, t) },
  hechizo: { nombre: 'Magia misteriosa', tocar: (d, t) => hechizo(d, t) },
};

export const listaAmbientes = () => Object.entries(AMBIENTES).map(([id, a]) => ({ id, nombre: a.nombre }));
export const listaEfectos = () => Object.entries(EFECTOS).map(([id, e]) => ({ id, nombre: e.nombre }));

const activos = new Map();   // id -> { ganancia, apagar }

export function ambienteActivo(id) { return activos.has(id); }

// Enciende o apaga un ambiente, con entrada y salida suaves. Devuelve si quedó encendido.
export function alternarAmbiente(id) {
  asegurarContexto();
  const actual = activos.get(id);
  if (actual) {
    activos.delete(id);
    actual.ganancia.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
    setTimeout(() => { try { actual.apagar(); } catch {} actual.ganancia.disconnect(); }, 2200);
    return false;
  }
  if (!AMBIENTES[id]) return false;
  const nodo = ctx.createGain();
  nodo.gain.value = 0;
  nodo.connect(salida);
  nodo.gain.setTargetAtTime(1, ctx.currentTime, 0.5);
  activos.set(id, { ganancia: nodo, apagar: AMBIENTES[id].armar(nodo) });
  return true;
}

export function tocarEfecto(id) { asegurarContexto(); if (EFECTOS[id]) EFECTOS[id].tocar(salida, ctx.currentTime + 0.02); }

// Para las pruebas: deja sonando un ambiente o un efecto desde el instante 0, sin entrada suave.
export function grabarParaPrueba(id) {
  if (AMBIENTES[id]) AMBIENTES[id].armar(salida);
  else EFECTOS[id].tocar(salida, 0.05);
}

// ---------- Sonidos propios (archivos del usuario) ----------
const propios = new Map();   // clave -> { buffer, fuente }

export async function cargarPropio(clave, datos) {
  asegurarContexto();
  detenerPropio(clave);
  propios.set(clave, { buffer: await ctx.decodeAudioData(datos.slice(0)), fuente: null });
}
export function quitarPropio(clave) { detenerPropio(clave); propios.delete(clave); }
export function propioSonando(clave) { const p = propios.get(clave); return !!(p && p.fuente); }
function detenerPropio(clave) {
  const p = propios.get(clave);
  if (p && p.fuente) { const f = p.fuente; p.fuente = null; try { f.stop(); } catch {} }
}
// Toca el sonido; si ya estaba sonando, lo detiene. Con enBucle se repite hasta apagarlo
// (para ambientes). Devuelve si quedó sonando.
export function alternarPropio(clave, enBucle, alTerminar) {
  asegurarContexto();
  const p = propios.get(clave);
  if (!p) return false;
  if (p.fuente) { detenerPropio(clave); return false; }
  const f = ctx.createBufferSource();
  f.buffer = p.buffer; f.loop = !!enBucle; f.connect(salida);
  f.onended = () => { if (p.fuente === f) { p.fuente = null; if (alTerminar) alTerminar(); } };
  f.start();
  p.fuente = f;
  return true;
}

export function silenciarTodo() {
  for (const id of [...activos.keys()]) alternarAmbiente(id);
  for (const c of propios.keys()) detenerPropio(c);
}
