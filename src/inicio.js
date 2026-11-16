// Pantalla de inicio: una mazmorra con antorchas, animada y con sonido de ambiente, donde se
// elige el rol (jugador o Dungeon Master) y después se entra a una sala o se omite ese paso.
// El fondo es un video en bucle; el sonido de ambiente se genera aparte (sonidos.js).
// Como respaldo hay una mazmorra dibujada por código en un lienzo 2D, que se pinta UNA sola
// vez y en cada cuadro solo suma la luz de las antorchas, las llamas, las chispas y la niebla.
import * as sonidos from './sonidos.js';

const $ = (id) => document.getElementById(id);
const W = 960, H = 540;
const CX = W * 0.5, CY = H * 0.47;          // punto de fuga del pasillo
const A = W * 0.62, T = H * 0.62, B = H * 0.6; // medio ancho, techo y piso a profundidad 1
const FONDO = 15;                             // profundidad donde termina el pasillo

// Azar repetible: la mazmorra sale siempre igual.
let semilla = 20261116;
function azar() { semilla = (semilla * 1664525 + 1013904223) >>> 0; return semilla / 4294967296; }

// De "lado, profundidad, altura" a la pantalla. lado: -1 pared izquierda, 1 derecha.
// f: 0 en el techo, 1 en el piso.
const px = (lado, z) => CX + lado * A / z;
const techo = (z) => CY - T / z;
const piso = (z) => CY + B / z;
const py = (z, f) => techo(z) + (piso(z) - techo(z)) * f;

function lienzo(ancho, alto) { const c = document.createElement('canvas'); c.width = ancho; c.height = alto; return c; }
function cuadrilatero(g, puntos, relleno, borde) {
  g.beginPath();
  puntos.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  if (relleno) { g.fillStyle = relleno; g.fill(); }
  if (borde) { g.strokeStyle = borde; g.stroke(); }
}
// Color de piedra: un gris cálido con variación, que se apaga con la distancia.
function piedra(z, variacion = 0.16, base = [150, 137, 120]) {
  const lejos = 0.22 + 0.78 / Math.pow(z, 0.75);
  const v = (1 - variacion / 2 + azar() * variacion) * lejos;
  return 'rgb(' + base.map((c) => Math.round(c * v)).join(',') + ')';
}

const ARCOS = [1.25, 2, 3.2, 5, 8];
const ANTORCHAS = [];       // se llenan al pintar: { x, y, z, fase }
const ABERTURAS = [
  { lado: -1, z1: 2.25, z2: 2.95, alto: 0.36, tipo: 'pasaje' },
  { lado: 1, z1: 2.25, z2: 2.95, alto: 0.42, tipo: 'celda' },
  { lado: -1, z1: 3.6, z2: 4.6, alto: 0.42, tipo: 'celda' },
  { lado: 1, z1: 3.6, z2: 4.6, alto: 0.36, tipo: 'pasaje' },
  { lado: -1, z1: 5.6, z2: 7.2, alto: 0.4, tipo: 'pasaje' },
  { lado: 1, z1: 5.6, z2: 7.2, alto: 0.42, tipo: 'celda' },
];

function pintarMazmorra() {
  const c = lienzo(W, H), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.lineWidth = 1;

  // Profundidades de las hiladas: cada vez más juntas en pantalla.
  const zs = [];
  for (let z = 0.9; z < FONDO; z *= 1.13) zs.push(z);
  zs.push(FONDO);

  // Techo: vigas oscuras.
  for (let i = 0; i < zs.length - 1; i++) {
    const z1 = zs[i], z2 = zs[i + 1];
    cuadrilatero(g, [[px(-1, z1), techo(z1)], [px(1, z1), techo(z1)], [px(1, z2), techo(z2)], [px(-1, z2), techo(z2)]], piedra(z1, 0.1, [70, 62, 56]), 'rgba(0,0,0,.5)');
  }
  // Piso de losas.
  const columnas = 7;
  for (let i = 0; i < zs.length - 1; i++) {
    const z1 = zs[i], z2 = zs[i + 1], corrido = i % 2 ? 0.5 : 0;
    for (let k = -1; k < columnas; k++) {
      const u1 = Math.max(-1, -1 + (k + corrido) * 2 / columnas), u2 = Math.min(1, -1 + (k + 1 + corrido) * 2 / columnas);
      if (u2 <= u1) continue;
      cuadrilatero(g, [[CX + u1 * A / z1, piso(z1)], [CX + u2 * A / z1, piso(z1)], [CX + u2 * A / z2, piso(z2)], [CX + u1 * A / z2, piso(z2)]], piedra(z1, 0.22, [104, 98, 92]), 'rgba(0,0,0,.55)');
    }
  }
  // Paredes de bloques, con las hiladas trabadas.
  const hiladas = 11;
  for (const lado of [-1, 1]) {
    for (let h = 0; h < hiladas; h++) {
      const f1 = h / hiladas, f2 = (h + 1) / hiladas;
      const cortes = h % 2 ? zs : [zs[0], ...zs.slice(0, -1).map((z, i) => Math.sqrt(z * zs[i + 1])), FONDO];
      for (let i = 0; i < cortes.length - 1; i++) {
        const z1 = cortes[i], z2 = cortes[i + 1];
        cuadrilatero(g, [[px(lado, z1), py(z1, f1)], [px(lado, z2), py(z2, f1)], [px(lado, z2), py(z2, f2)], [px(lado, z1), py(z1, f2)]], piedra(z1), 'rgba(0,0,0,.6)');
      }
    }
  }
  // Fondo del pasillo: se pierde en una bruma fría.
  const xi = px(-1, FONDO), xd = px(1, FONDO), ya = techo(FONDO), yb = piso(FONDO);
  const bruma = g.createRadialGradient(CX, CY, 1, CX, CY, (xd - xi) * 1.6);
  bruma.addColorStop(0, 'rgb(52,62,84)'); bruma.addColorStop(0.5, 'rgba(22,26,40,.9)'); bruma.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = '#05060a'; g.fillRect(xi, ya, xd - xi, yb - ya);
  g.fillStyle = bruma; g.fillRect(xi - 60, ya - 50, xd - xi + 120, yb - ya + 100);

  // Calabozos con rejas y pasajes oscuros que salen a los costados.
  for (const a of ABERTURAS) {
    const { lado, z1, z2, alto } = a, zm1 = z1 * Math.pow(z2 / z1, 0.3), zm2 = z1 * Math.pow(z2 / z1, 0.7);
    const contorno = [[px(lado, z1), py(z1, 1)], [px(lado, z1), py(z1, alto + 0.09)], [px(lado, zm1), py(zm1, alto)], [px(lado, zm2), py(zm2, alto)], [px(lado, z2), py(z2, alto + 0.09)], [px(lado, z2), py(z2, 1)]];
    const sombra = g.createLinearGradient(px(lado, z1), 0, px(lado, z2), 0);
    sombra.addColorStop(0, a.tipo === 'pasaje' ? '#0d0c10' : '#090808'); sombra.addColorStop(1, '#000');
    cuadrilatero(g, contorno, sombra);
    g.lineWidth = Math.max(1.5, 7 / z1);
    cuadrilatero(g, contorno, null, piedra(z1, 0.05, [150, 138, 122]));
    g.lineWidth = 1;
    if (a.tipo === 'pasaje') {
      // Un resplandor frío, apenas, al fondo del pasaje: invita a pensar que sigue.
      const x0 = px(lado, zm2), y0 = py(zm2, 0.72), r = 70 / z1;
      const frio = g.createRadialGradient(x0, y0, 1, x0, y0, r);
      frio.addColorStop(0, 'rgba(60,76,110,.5)'); frio.addColorStop(1, 'rgba(0,0,0,0)');
      g.save(); g.beginPath(); contorno.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.clip();
      g.fillStyle = frio; g.fillRect(x0 - r, y0 - r, r * 2, r * 2); g.restore();
    } else {
      // Rejas: barrotes verticales y dos travesaños.
      const barrotes = 7;
      for (let i = 1; i < barrotes; i++) {
        const z = z1 * Math.pow(z2 / z1, i / barrotes), arriba = alto + 0.09 * Math.abs(i / barrotes - 0.5) * 2 + 0.01;
        g.lineWidth = Math.max(1.2, 5 / z); g.strokeStyle = '#17130f';
        g.beginPath(); g.moveTo(px(lado, z), py(z, arriba)); g.lineTo(px(lado, z), py(z, 1)); g.stroke();
        g.lineWidth = Math.max(0.6, 1.4 / z); g.strokeStyle = 'rgba(150,135,115,.55)';
        g.beginPath(); g.moveTo(px(lado, z) - lado * 1.5 / z, py(z, arriba)); g.lineTo(px(lado, z) - lado * 1.5 / z, py(z, 1)); g.stroke();
      }
      for (const f of [0.58, 0.86]) {
        g.lineWidth = Math.max(1.2, 5 / z1); g.strokeStyle = '#1b1612';
        g.beginPath(); g.moveTo(px(lado, z1), py(z1, f)); g.lineTo(px(lado, z2), py(z2, f)); g.stroke();
      }
      g.lineWidth = 1;
    }
  }

  // Arcos de piedra que cruzan el pasillo, del más lejano al más cercano.
  for (const z of [...ARCOS].reverse()) {
    const grosor = W * 0.055 / z, ya2 = techo(z), yb2 = piso(z), arranque = ya2 + (yb2 - ya2) * 0.3, clave = ya2 + (yb2 - ya2) * 0.07;
    const xI = px(-1, z), xD = px(1, z);
    const tono = g.createLinearGradient(0, ya2, 0, yb2);
    tono.addColorStop(0, piedra(z, 0.02, [112, 102, 90])); tono.addColorStop(1, piedra(z, 0.02, [140, 128, 112]));
    g.beginPath();
    g.moveTo(xI - 4, ya2 - 4); g.lineTo(xD + 4, ya2 - 4); g.lineTo(xD + 4, yb2); g.lineTo(xD - grosor, yb2); g.lineTo(xD - grosor, arranque);
    g.quadraticCurveTo(xD - grosor, clave + (arranque - clave) * 0.25, CX, clave);
    g.quadraticCurveTo(xI + grosor, clave + (arranque - clave) * 0.25, xI + grosor, arranque);
    g.lineTo(xI + grosor, yb2); g.lineTo(xI - 4, yb2); g.closePath();
    g.fillStyle = tono; g.fill();
    g.strokeStyle = 'rgba(0,0,0,.7)'; g.lineWidth = Math.max(1, 2.5 / z); g.stroke();
    // Juntas de los bloques del pilar.
    g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 1;
    for (let k = 1; k < 9; k++) {
      const y = arranque + (yb2 - arranque) * k / 9;
      for (const [x1, x2] of [[xI, xI + grosor], [xD - grosor, xD]]) { g.beginPath(); g.moveTo(x1, y); g.lineTo(x2, y); g.stroke(); }
    }
    // Antorchas en los pilares de algunos arcos.
    if (z === 2 || z === 5) {
      for (const lado of [-1, 1]) {
        const x = px(lado, z) - lado * (grosor + 13 / z), y = py(z, 0.47), e = 1 / z * 2;
        g.strokeStyle = '#120e0b'; g.lineCap = 'round';
        g.lineWidth = 5 * e; g.beginPath(); g.moveTo(px(lado, z) - lado * grosor, y + 26 * e); g.lineTo(x, y + 18 * e); g.stroke();   // soporte
        g.lineWidth = 6 * e; g.strokeStyle = '#3a2a1c'; g.beginPath(); g.moveTo(x, y + 26 * e); g.lineTo(x, y + 2 * e); g.stroke();    // palo
        g.fillStyle = '#1a1512'; g.beginPath(); g.ellipse(x, y + 2 * e, 7 * e, 4 * e, 0, 0, Math.PI * 2); g.fill();                   // cazoleta
        g.lineCap = 'butt';
        ANTORCHAS.push({ x, y: y - 2 * e, z, e, fase: azar() * 100, chispas: [] });
      }
    }
  }
  // Cadenas colgando del primer arco visible.
  for (const [x, largo] of [[CX - 150, 96], [CX - 128, 64], [CX + 170, 80]]) {
    for (let y = techo(2) + 30; y < techo(2) + 30 + largo; y += 9) {
      g.strokeStyle = '#201b17'; g.lineWidth = 2.2;
      g.beginPath(); g.ellipse(x, y + 4, 2.6, 5, 0, 0, Math.PI * 2); g.stroke();
    }
  }
  return c;
}

// Niebla: manchas blandas que después se deslizan despacio sobre el piso.
function pintarNiebla() {
  const c = lienzo(512, 160), g = c.getContext('2d');
  for (let i = 0; i < 46; i++) {
    const x = azar() * 512, y = 62 + azar() * 46, r = 24 + azar() * 34;
    for (const dx of [-512, 0, 512]) {       // se repite a los costados para que empalme
      const m = g.createRadialGradient(x + dx, y, 1, x + dx, y, r);
      m.addColorStop(0, 'rgba(150,160,190,.10)'); m.addColorStop(1, 'rgba(150,160,190,0)');
      g.fillStyle = m; g.fillRect(x + dx - r, y - r, r * 2, r * 2);
    }
  }
  return c;
}

let base = null, niebla = null, luz = null, gl = null, gp = null, vivo = false, ultimo = 0;

// Parpadeo de cada antorcha: mezcla de ondas lentas y rápidas, entre 0 y 1 aprox.
const parpadeo = (t, fase) => 0.5 + 0.22 * Math.sin(t * 2.1 + fase) + 0.16 * Math.sin(t * 5.7 + fase * 2.3) + 0.12 * Math.sin(t * 13.3 + fase * 0.7);

function cuadro(ms) {
  if (!vivo) return;
  requestAnimationFrame(cuadro);
  if (ms - ultimo < 31) return;                 // unos 30 cuadros por segundo alcanzan
  const dt = Math.min((ms - ultimo) / 1000, 0.1), t = ms / 1000;
  ultimo = ms;

  // 1) Mapa de luz, en chico: oscuridad azulada + el resplandor de cada antorcha.
  const k = luz.width / W;
  gl.globalCompositeOperation = 'source-over';
  gl.fillStyle = 'rgb(38,38,60)'; gl.fillRect(0, 0, luz.width, luz.height);
  gl.globalCompositeOperation = 'lighter';
  for (const a of ANTORCHAS) {
    const p = parpadeo(t, a.fase), r = (H * 1.5 / Math.pow(a.z, 0.85)) * (0.92 + 0.14 * p) * k, fuerza = 0.72 + 0.28 * p;
    const m = gl.createRadialGradient(a.x * k, a.y * k, 0, a.x * k, a.y * k, r);
    m.addColorStop(0, 'rgba(255,196,120,' + fuerza + ')'); m.addColorStop(0.22, 'rgba(255,142,62,' + 0.6 * fuerza + ')');
    m.addColorStop(0.55, 'rgba(190,80,30,' + 0.22 * fuerza + ')'); m.addColorStop(1, 'rgba(120,40,10,0)');
    gl.fillStyle = m; gl.fillRect(a.x * k - r, a.y * k - r, r * 2, r * 2);
  }
  // Bordes de la pantalla más oscuros.
  gl.globalCompositeOperation = 'multiply';
  const borde = gl.createRadialGradient(luz.width / 2, luz.height * 0.48, luz.height * 0.35, luz.width / 2, luz.height * 0.48, luz.width * 0.72);
  borde.addColorStop(0, '#fff'); borde.addColorStop(1, '#1c1a22');
  gl.fillStyle = borde; gl.fillRect(0, 0, luz.width, luz.height);

  // 2) La mazmorra, multiplicada por la luz.
  gp.globalCompositeOperation = 'source-over'; gp.globalAlpha = 1;
  gp.drawImage(base, 0, 0);
  gp.globalCompositeOperation = 'multiply';
  gp.drawImage(luz, 0, 0, W, H);

  // 3) Niebla baja que se desliza.
  gp.globalCompositeOperation = 'screen'; gp.globalAlpha = 0.4;
  for (const [vel, y, alto] of [[9, H * 0.56, H * 0.5], [-5, H * 0.46, H * 0.42]]) {
    const corr = ((t * vel) % 512 + 512) % 512;
    gp.drawImage(niebla, corr, 0, 512 - corr, 160, 0, y, (512 - corr) * W / 512, alto);
    gp.drawImage(niebla, 0, 0, corr, 160, (512 - corr) * W / 512, y, corr * W / 512, alto);
  }
  gp.globalAlpha = 1;

  // 4) Llamas y chispas, sumando luz.
  gp.globalCompositeOperation = 'lighter';
  for (const a of ANTORCHAS) {
    const p = parpadeo(t, a.fase), e = a.e;
    const halo = gp.createRadialGradient(a.x, a.y - 8 * e, 0, a.x, a.y - 8 * e, 46 * e);
    halo.addColorStop(0, 'rgba(255,170,70,' + (0.3 + 0.15 * p) + ')'); halo.addColorStop(1, 'rgba(255,120,30,0)');
    gp.fillStyle = halo; gp.fillRect(a.x - 46 * e, a.y - 54 * e, 92 * e, 92 * e);
    for (let i = 0; i < 6; i++) {
      const sube = i * 5.2 * e * (0.85 + 0.35 * p), r = (10.5 - i * 1.5) * e * (0.9 + 0.2 * Math.sin(t * 9 + i * 1.7 + a.fase));
      const x = a.x + Math.sin(t * 6.3 + i * 1.3 + a.fase) * i * 0.9 * e, y = a.y - 3 * e - sube;
      const m = gp.createRadialGradient(x, y, 0, x, y, r);
      m.addColorStop(0, i < 2 ? 'rgba(255,244,200,.85)' : 'rgba(255,200,90,.6)'); m.addColorStop(0.5, 'rgba(255,130,30,.4)'); m.addColorStop(1, 'rgba(200,50,0,0)');
      gp.fillStyle = m;
      gp.beginPath(); gp.ellipse(x, y, r * 0.78, r * 1.25, 0, 0, Math.PI * 2); gp.fill();
    }
    // Chispas que suben y se apagan.
    if (a.chispas.length < 14 && Math.random() < dt * 5) a.chispas.push({ x: a.x + (Math.random() - 0.5) * 6 * e, y: a.y - 14 * e, vx: (Math.random() - 0.5) * 14 * e, vy: -(18 + Math.random() * 26) * e, vida: 1 });
    for (const c of a.chispas) {
      c.x += (c.vx + Math.sin(t * 3 + c.y * 0.1) * 6 * e) * dt; c.y += c.vy * dt; c.vida -= dt * (0.5 + Math.random() * 0.5);
      gp.fillStyle = 'rgba(255,' + Math.round(120 + 100 * c.vida) + ',40,' + Math.max(0, c.vida) + ')';
      gp.fillRect(c.x, c.y, Math.max(1, 1.6 * e), Math.max(1, 1.6 * e));
    }
    a.chispas = a.chispas.filter((c) => c.vida > 0);
  }
  gp.globalCompositeOperation = 'source-over';
}

// El fondo es un video en bucle (src/medios/mazmorra.webm). Si el video faltara o no se
// pudiera reproducir, se usa la mazmorra dibujada por código, que no depende de ningún archivo.
let conVideo = true, fondoPedido = false;
function animarFondo(encender) {
  fondoPedido = encender;
  const video = $('inicioVideo');
  if (conVideo) {
    if (!video.dataset.listo) {
      video.dataset.listo = '1';
      const sinVideo = (motivo) => { if (!conVideo) return; console.error('Inicio: sin video de fondo (' + motivo + '); se usa el dibujo.'); conVideo = false; video.hidden = true; animarDibujo(fondoPedido); };
      video.addEventListener('error', () => sinVideo('no se pudo cargar'));
      video.addEventListener('playing', () => { video.hidden = false; }, { once: true });
      video.puedeFallar = sinVideo;
    }
    if (encender) video.play().catch((e) => video.puedeFallar(e.message || e)); else video.pause();
    return;
  }
  animarDibujo(encender);
}
function animarDibujo(encender) {
  if (encender === vivo) return;
  vivo = encender;
  if (!vivo) return;
  if (!base) {
    base = pintarMazmorra(); niebla = pintarNiebla();
    luz = lienzo(W / 4, H / 4); gl = luz.getContext('2d');
    gp = $('inicioLienzo').getContext('2d');
  }
  ultimo = 0;
  requestAnimationFrame(cuadro);
}

// ---------- La pantalla ----------
let apagarSonido = null, opciones = null, rolElegido = null, ocupado = false, abierta = false;

function sonar(encender) {
  if (encender && !apagarSonido) apagarSonido = sonidos.ambienteInicio(0.8);
  else if (!encender && apagarSonido) { apagarSonido(); apagarSonido = null; }
  $('inicioSonido').textContent = encender ? 'Sonido: sí' : 'Sonido: no';
  $('inicioSonido').setAttribute('aria-pressed', String(encender));
}
function paso(cual) {
  $('inicioRol').hidden = cual !== 'rol';
  $('inicioSala').hidden = cual !== 'sala';
  $('inicioAviso').textContent = '';
  if (cual === 'sala') {
    const dm = rolElegido === 'dm';
    $('inicioTitulo').textContent = dm ? 'Dungeon Master: abrí la mesa' : 'Jugador: entrá a la mesa';
    $('inicioFilaPersonaje').hidden = dm;
    $('inicioCrear').hidden = !dm;
    $('inicioRotuloCodigo').textContent = dm ? 'Código (solo si ya tenés una sala)' : 'Código que te pasó el Dungeon Master';
    $('inicioEntrar').textContent = dm ? 'Entrar con ese código' : 'Entrar a la sala';
    $('inicioEntrar').className = dm ? 'plano' : 'principal';
    (($('inicioNombre').value || dm) ? (dm ? $('inicioCrear') : $('inicioCodigo')) : $('inicioNombre')).focus();
  }
}
function cerrar() {
  abierta = false;
  sonar(false);
  $('inicio').classList.add('saliendo');
  setTimeout(() => { $('inicio').hidden = true; $('inicio').classList.remove('saliendo', 'entrando'); animarFondo(false); }, 600);
  document.body.classList.remove('en-inicio');
  opciones.alTerminar();
}
// Golpe fuerte, la imagen se acerca y se funde a negro. Se usa al elegir el rol y al salir
// de la pantalla (omitir, crear sala o entrar a una). Devuelve cuando ya está todo negro.
function golpeYZoom() {
  if (apagarSonido) sonidos.tocarEntrada();        // respeta "Sonido: no"
  $('inicio').classList.add('entrando');
  return new Promise((listo) => setTimeout(listo, 1800));
}
async function salirConGolpe() {
  ocupado = true;
  await golpeYZoom();
  ocupado = false;
  cerrar();        // del negro aparece el escenario
}
async function conectar(crear) {
  if (ocupado) return;
  ocupado = true;
  $('inicioAviso').textContent = 'Conectando…';
  for (const b of $('inicioSala').querySelectorAll('button')) b.disabled = true;
  let error = 'No se pudo conectar.';
  try {
    error = await opciones.alConectar({ crear, nombre: $('inicioNombre').value.trim(), personaje: $('inicioPersonaje').value.trim(), codigo: $('inicioCodigo').value });
  } catch (e) { console.error('Inicio: ' + (e.stack || e)); }
  for (const b of $('inicioSala').querySelectorAll('button')) b.disabled = false;
  ocupado = false;
  // El golpe suena cuando la conexión salió bien; si falló, solo se avisa.
  if (error) $('inicioAviso').textContent = error; else { $('inicioAviso').textContent = ''; salirConGolpe(); }
}

let enlazado = false;
function enlazar() {
  if (enlazado) return;
  enlazado = true;
  // Al elegir: golpe fuerte, la imagen se acerca y se funde a negro; del negro sale el paso siguiente.
  const elegir = async (rol) => {
    if (ocupado) return;
    ocupado = true;
    rolElegido = rol; opciones.alElegirRol(rol);
    await golpeYZoom();
    ocupado = false; paso('sala'); $('inicio').classList.remove('entrando');
  };
  $('inicioJugador').addEventListener('click', () => elegir('jugador'));
  $('inicioDM').addEventListener('click', () => elegir('dm'));
  $('inicioVolver').addEventListener('click', () => { if (!ocupado) paso('rol'); });
  $('inicioOmitir').addEventListener('click', () => { if (!ocupado) salirConGolpe(); });
  $('inicioCrear').addEventListener('click', () => conectar(true));
  $('inicioEntrar').addEventListener('click', () => conectar(false));
  $('inicioCodigo').addEventListener('keydown', (e) => { if (e.key === 'Enter') conectar(false); });
  $('inicioSonido').addEventListener('click', () => { const encender = !apagarSonido; sonar(encender); opciones.alCambiarSonido(encender); });
  // Si la ventana queda tapada o minimizada, no se gasta en dibujar.
  document.addEventListener('visibilitychange', () => { if (abierta) animarFondo(!document.hidden); });
}

// opciones: { nombre, personaje, codigo, conSonido, alElegirRol(rol), alConectar(datos) -> texto
// de error o '' si entró, alCambiarSonido(encendido), alTerminar() }
export function abrirInicio(o) {
  opciones = o;
  enlazar();
  abierta = true;
  $('inicioNombre').value = o.nombre || ''; $('inicioPersonaje').value = o.personaje || ''; $('inicioCodigo').value = o.codigo || '';
  $('inicio').hidden = false;
  document.body.classList.add('en-inicio');
  paso('rol');
  animarFondo(true);
  sonar(o.conSonido !== false);
}
export const inicioAbierto = () => abierta;
