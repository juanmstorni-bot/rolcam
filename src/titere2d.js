// Personaje ilustrado 2.5D: una imagen plana convertida en una "marioneta con relieve".
// La imagen se pega sobre una malla curvada (la cabeza es una cúpula, el cuerpo un cilindro
// suave) y la cabeza gira de verdad en 3D alrededor del cuello, lo que da sensación de volumen.
// La boca y el parpadeo se pintan encima, en las posiciones que marcó el usuario.
import * as THREE from 'three';

const ALTO = 0.95;          // alto de la marioneta en unidades de la escena
const CENTRO_Y = 1.3;       // misma altura a la que mira la cámara

const VERTICES = /* glsl */`
  attribute float aPesoCabeza;
  uniform mat3 uRotCabeza;
  uniform mat3 uRotTorso;
  uniform vec3 uPivoteCabeza;
  uniform vec3 uPivoteTorso;
  uniform float uRespira;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    p.y = uPivoteTorso.y + (p.y - uPivoteTorso.y) * (1.0 + uRespira);
    vec3 cabeza = uRotCabeza * (p - uPivoteCabeza) + uPivoteCabeza;
    p = mix(p, cabeza, aPesoCabeza);
    p = uRotTorso * (p - uPivoteTorso) + uPivoteTorso;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const FRAGMENTOS = /* glsl */`
  uniform sampler2D uMapa;
  uniform float uAspecto;      // ancho / alto de la imagen
  uniform vec2 uBoca;
  uniform vec2 uOjoI;
  uniform vec2 uOjoD;
  uniform float uRadioBoca;    // en fracción del ancho de la imagen
  uniform float uRadioOjo;
  uniform float uAbreBoca;     // 0..1
  uniform float uParpadeo;     // 0..1
  uniform float uUsaBoca;
  uniform float uUsaOjos;
  varying vec2 vUv;

  // Distancia a un punto de la imagen, medida en "anchos de imagen" para que los círculos no se deformen.
  vec2 hacia(vec2 punto) { vec2 d = vUv - punto; d.y /= uAspecto; return d; }

  vec3 parpado(vec3 color, vec2 ojo) {
    vec2 q = hacia(ojo) / uRadioOjo;
    float dentro = 1.0 - smoothstep(0.85, 1.0, length(q));
    float borde = 1.0 - 2.0 * uParpadeo;                       // el párpado baja desde arriba
    float tapa = smoothstep(borde - 0.08, borde + 0.08, q.y);
    vec3 piel = texture2D(uMapa, ojo - vec2(0.0, 2.0 * uRadioOjo * uAspecto)).rgb;   // color de la mejilla
    color = mix(color, piel, dentro * tapa);
    float pestana = (1.0 - smoothstep(0.0, 0.14, abs(q.y - borde))) * dentro * step(0.15, uParpadeo);
    return mix(color, piel * 0.45, pestana * 0.8);
  }

  void main() {
    vec4 col = texture2D(uMapa, vUv);
    if (col.a < 0.03) discard;
    if (uUsaOjos > 0.5 && uParpadeo > 0.02) {
      col.rgb = parpado(col.rgb, uOjoI);
      col.rgb = parpado(col.rgb, uOjoD);
    }
    if (uUsaBoca > 0.5 && uAbreBoca > 0.05) {
      vec2 d = hacia(uBoca);
      vec2 e = vec2(d.x / uRadioBoca, d.y / (uRadioBoca * 0.8 * uAbreBoca));
      float m = 1.0 - smoothstep(0.7, 1.0, length(e));
      col.rgb = mix(col.rgb, vec3(0.05, 0.01, 0.02), m);
    }
    gl_FragColor = col;
    #include <colorspace_fragment>
  }
`;

const limitar = (v, m) => Math.max(-m, Math.min(m, v));
const escalon = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Marcadores por defecto, en coordenadas de la imagen (0..1, y hacia abajo); radio en fracción del ancho.
export function marcadoresPorDefecto() {
  return {
    cabeza: { x: 0.5, y: 0.22, r: 0.16 },
    boca: { x: 0.5, y: 0.30 },
    ojoI: { x: 0.44, y: 0.2 },
    ojoD: { x: 0.56, y: 0.2 },
    usaBoca: true, usaOjos: true,
  };
}

// Quita un fondo liso: borra desde las cuatro esquinas todo lo que se parezca al color de la esquina.
export function quitarFondoLiso(imagen, tolerancia = 42) {
  const w = imagen.naturalWidth || imagen.width, h = imagen.naturalHeight || imagen.height;
  const lienzo = document.createElement('canvas');
  lienzo.width = w; lienzo.height = h;
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(imagen, 0, 0);
  const datos = ctx.getImageData(0, 0, w, h), px = datos.data;
  const visto = new Uint8Array(w * h);
  const tol2 = tolerancia * tolerancia * 3;
  for (const [sx, sy] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) {
    const i0 = (sy * w + sx) * 4;
    if (px[i0 + 3] < 10) continue;                       // esa esquina ya es transparente
    const r0 = px[i0], g0 = px[i0 + 1], b0 = px[i0 + 2];
    const pila = [sy * w + sx];
    while (pila.length) {
      const n = pila.pop();
      if (visto[n]) continue;
      const i = n * 4, dr = px[i] - r0, dg = px[i + 1] - g0, db = px[i + 2] - b0;
      if (px[i + 3] >= 10 && dr * dr + dg * dg + db * db > tol2) continue;
      visto[n] = 1; px[i + 3] = 0;
      const x = n % w, y = (n - x) / w;
      if (x > 0) pila.push(n - 1);
      if (x < w - 1) pila.push(n + 1);
      if (y > 0) pila.push(n - w);
      if (y < h - 1) pila.push(n + w);
    }
  }
  // Borde: se descarta el primer anillo de píxeles (suele quedar teñido del color del fondo)
  // y se deja semitransparente el segundo, para que el contorno no quede serruchado.
  for (const alfaNuevo of [0, 128]) {
    const borde = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = y * w + x;
      if (px[n * 4 + 3] < 200) continue;
      if ((x > 0 && px[(n - 1) * 4 + 3] === 0) || (x < w - 1 && px[(n + 1) * 4 + 3] === 0) ||
          (y > 0 && px[(n - w) * 4 + 3] === 0) || (y < h - 1 && px[(n + w) * 4 + 3] === 0)) borde.push(n);
    }
    for (const n of borde) px[n * 4 + 3] = alfaNuevo;
  }
  ctx.putImageData(datos, 0, 0);
  return lienzo;
}

// ¿La imagen ya trae transparencia en alguna esquina?
export function tieneTransparencia(imagen) {
  const w = imagen.naturalWidth || imagen.width, h = imagen.naturalHeight || imagen.height;
  const lienzo = document.createElement('canvas');
  lienzo.width = w; lienzo.height = h;
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(imagen, 0, 0);
  return [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]].some(([x, y]) => ctx.getImageData(x, y, 1, 1).data[3] < 10);
}

export class Titere2D {
  // imagen: HTMLImageElement o canvas ya recortado; m: marcadores
  constructor(imagen, m) {
    const w = imagen.naturalWidth || imagen.width, h = imagen.naturalHeight || imagen.height;
    const aspecto = w / h;
    const alto = ALTO, ancho = alto * aspecto;
    const segX = 64, segY = Math.max(32, Math.round(64 / aspecto));
    const geo = new THREE.PlaneGeometry(ancho, alto, segX, Math.min(segY, 128));

    // Marcadores pasados a coordenadas de la malla (origen en el centro, y hacia arriba).
    const cx = (m.cabeza.x - 0.5) * ancho, cy = (0.5 - m.cabeza.y) * alto, R = m.cabeza.r * ancho;
    const cuelloY = cy - R;

    const pos = geo.attributes.position;
    const pesos = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      // Relieve: el cuerpo es un cilindro suave y la cabeza una cúpula.
      const cuerpo = 0.12 * ancho * Math.cos(Math.min(1, Math.abs(x) / (ancho / 2)) * Math.PI / 2);
      const d = Math.hypot(x - cx, y - cy) / R;
      const cupula = d < 1 ? 0.55 * R * Math.sqrt(1 - d * d) : 0;
      // Peso de la cabeza: todo lo que está por encima del cuello y cerca del eje de la cabeza
      // (pelo, sombrero, cuernos) gira con ella; lo que está lejos a los costados, no.
      const vertical = escalon(cuelloY - 0.35 * R, cuelloY + 0.15 * R, y);
      const lateral = 1 - escalon(1.3 * R, 2.0 * R, Math.abs(x - cx));
      const peso = vertical * lateral;
      pesos[i] = peso;
      pos.setZ(i, cuerpo * (1 - peso) + (cuerpo * 0.5 + cupula) * peso);
    }
    geo.setAttribute('aPesoCabeza', new THREE.BufferAttribute(pesos, 1));

    this.textura = imagen instanceof HTMLCanvasElement ? new THREE.CanvasTexture(imagen) : new THREE.Texture(imagen);
    this.textura.colorSpace = THREE.SRGBColorSpace;
    this.textura.needsUpdate = true;

    const uv = (p) => new THREE.Vector2(p.x, 1 - p.y);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTICES, fragmentShader: FRAGMENTOS, transparent: true, side: THREE.DoubleSide,
      uniforms: {
        uMapa: { value: this.textura }, uAspecto: { value: aspecto },
        uRotCabeza: { value: new THREE.Matrix3() }, uRotTorso: { value: new THREE.Matrix3() },
        uPivoteCabeza: { value: new THREE.Vector3(cx, cuelloY, 0) },
        uPivoteTorso: { value: new THREE.Vector3(0, -alto / 2, 0) },
        uRespira: { value: 0 },
        uBoca: { value: uv(m.boca) }, uOjoI: { value: uv(m.ojoI) }, uOjoD: { value: uv(m.ojoD) },
        uRadioBoca: { value: m.cabeza.r * 0.3 }, uRadioOjo: { value: m.cabeza.r * 0.2 },
        uAbreBoca: { value: 0 }, uParpadeo: { value: 0 },
        uUsaBoca: { value: m.usaBoca ? 1 : 0 }, uUsaOjos: { value: m.usaOjos ? 1 : 0 },
      },
    });
    this.objeto = new THREE.Mesh(geo, this.material);
    this.objeto.position.y = CENTRO_Y;
    this.objeto.frustumCulled = false;

    // Estado actual y objetivos (el personaje se acerca a los objetivos en cada cuadro dibujado).
    this.cabeza = new THREE.Quaternion(); this.cabezaObj = new THREE.Quaternion();
    this.torso = new THREE.Quaternion(); this.torsoObj = new THREE.Quaternion();
    this.boca = 0; this.bocaObj = 0; this.parpadeo = 0; this.parpadeoObj = 0;
    this.tiempo = 0;
    this._m4 = new THREE.Matrix4();
  }

  // cara: resultado de Kalidokit.Face.solve (o null); torso: cuaternión de resolverTorso (o null)
  fijar({ cara, torso }) {
    if (cara) {
      const h = cara.head;
      // Mismos signos que un modelo que mira hacia la cámara (como VRM 1.0).
      this.cabezaObj.setFromEuler(new THREE.Euler(limitar(-h.x * 0.8, 0.35), limitar(h.y * 0.8, 0.5), limitar(-h.z * 0.8, 0.5), 'XYZ'));
      const b = cara.mouth.shape;
      this.bocaObj = Math.min(1, Math.max(0, b.A + 0.6 * b.O + 0.4 * (b.U + b.E + b.I)));
      this.parpadeoObj = Math.min(1, Math.max(0, 1 - (cara.eye.l + cara.eye.r) / 2));
    }
    if (torso) this.torsoObj.identity().slerp(torso, 0.6);
  }

  actualizar(dt, alfa) {
    this.tiempo += dt;
    this.cabeza.slerp(this.cabezaObj, alfa);
    this.torso.slerp(this.torsoObj, alfa);
    const rapido = Math.min(1, alfa * 2);
    this.boca += (this.bocaObj - this.boca) * rapido;
    this.parpadeo += (this.parpadeoObj - this.parpadeo) * rapido;
    const u = this.material.uniforms;
    u.uRotCabeza.value.setFromMatrix4(this._m4.makeRotationFromQuaternion(this.cabeza));
    u.uRotTorso.value.setFromMatrix4(this._m4.makeRotationFromQuaternion(this.torso));
    u.uAbreBoca.value = this.boca;
    u.uParpadeo.value = this.parpadeo;
    u.uRespira.value = Math.sin(this.tiempo * 1.6) * 0.006;   // respiración suave
  }

  liberar() {
    this.objeto.geometry.dispose();
    this.material.dispose();
    this.textura.dispose();
  }
}
