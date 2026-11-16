# Arquitectura de RolCam

Este documento explica cómo está armado RolCam por dentro: qué piezas tiene, cómo se
hablan entre sí y cómo se conectan las PC de una mesa. Está escrito para alguien con base
de desarrollo; cada término técnico va con su explicación.

## En una frase

RolCam es una aplicación de escritorio hecha con tecnologías web (JavaScript, HTML y CSS)
que usa visión por computadora para mover un personaje 3D con el cuerpo del jugador, lo
muestra como si fuera una webcam, y se conecta con las otras PC de la mesa directamente,
sin servidor propio.

## Vista general

```
        PC del jugador                                        PC del Dungeon Master
┌───────────────────────────────┐                        ┌───────────────────────────────┐
│ Ventana oculta: seguimiento   │                        │ Proceso principal             │
│   webcam + MediaPipe          │                        │   ajustes, sonidos propios    │
│            │ puntos del cuerpo│                        │                               │
│            ▼                  │      Relés públicos    │ Ventana visible: la mesa      │
│ Proceso principal             │   (solo para encontrarse)   cartas, vida, fondo        │
│   reparte mensajes, archivos  │ ─ ─ ─ ─ ─ ┬ ─ ─ ─ ─ ─ ─ │   sonidos generados por código│
│            │                  │           │            │                               │
│            ▼                  │                        │                               │
│ Ventana visible: escenario    │ ◄══════════════════════► (la misma aplicación; el rol   │
│   personaje 3D, sonidos, sala │   conexión directa     │  decide qué pantalla se ve)   │
│            │ imagen           │       (WebRTC)         │                               │
│            ▼                  │                        │                               │
│ Cámara virtual "RolCam" ──► Discord                    │                               │
└───────────────────────────────┘                        └───────────────────────────────┘
```

Es un solo programa para todos. El rol elegido en la pantalla de inicio (jugador o
Dungeon Master) decide qué pantalla se muestra y quién manda en la mesa.

## 1. La base: Electron

[Electron](https://www.electronjs.org/) empaqueta un navegador (Chromium) y Node.js en un
programa de escritorio. Por eso RolCam se escribe como una página web, pero puede hacer
cosas que una página no puede: leer y guardar archivos, lanzar otros programas, instalar
una cámara virtual.

Hay tres procesos:

| Proceso | Archivo | Qué hace |
| --- | --- | --- |
| Principal | `main.js` | Crea las ventanas, guarda ajustes y archivos del usuario, pasa mensajes entre ventanas, maneja la cámara virtual |
| Ventana oculta: seguimiento | `src/seguimiento.*` | Abre la webcam y analiza cada cuadro |
| Ventana visible: escenario | `src/escenario.*` | Dibuja el personaje y contiene toda la interfaz |

**Por qué dos ventanas.** Analizar la cámara es lento y dibujar tiene que ser fluido. En
procesos separados, uno no frena al otro: el dibujo va a 60 cuadros por segundo aunque el
seguimiento vaya más despacio.

**Cómo se hablan.** Las ventanas no se comunican directo. Usan un "puente" (`preload.js`)
que expone solo una lista fija de canales (`cuadro`, `estado`, `control`, etc.), y el
proceso principal retransmite. Es la medida de seguridad estándar en Electron: la página
no tiene acceso libre al sistema.

**Cómo se sirven los archivos.** Las páginas se cargan por un protocolo propio,
`app://local/…`, en vez de `file://`. Eso las hace un "contexto seguro", necesario para
usar la cámara y cargar los modelos. La ruta `/usuario/…` apunta a la carpeta de datos del
usuario.

## 2. Del cuerpo al personaje

Es una cadena de cuatro pasos:

1. **Detección** (`src/seguimiento.js`). [MediaPipe](https://ai.google.dev/edge/mediapipe),
   una librería de Google que corre modelos de inteligencia artificial en la propia PC,
   recibe cada cuadro de la webcam y devuelve puntos: 33 del cuerpo, 478 de la cara y 21
   por mano. Hay dos modos: completo (cuerpo, cara y manos) y liviano (sin dedos).
2. **Solver** (`src/escenario.js`). Código propio que convierte puntos en rotaciones de
   huesos. Por ejemplo, con hombro, codo y muñeca calcula cuánto girar el brazo y el
   antebrazo; con la palma de la mano, cómo orientar la muñeca. Para la cara y los dedos
   se apoya en la librería Kalidokit.
3. **Filtrado.** Los puntos tiemblan, así que se suavizan con un filtro "One Euro" (suaviza
   mucho cuando el cuerpo está quieto y poco cuando se mueve rápido). Además hay reglas
   para casos difíciles: una mano que sale de cuadro, que tapa la cara o que se superpone
   con la otra mantiene la última pose buena.
4. **Dibujo.** [three.js](https://threejs.org/), una librería de gráficos 3D sobre WebGL,
   dibuja el personaje con esas rotaciones.

**Formatos de personaje:**

- **VRM** (con `@pixiv/three-vrm`): estándar abierto para avatares; incluye expresiones de
  cara.
- **GLB y FBX** (`src/importar.js`): se reconocen los huesos por nombre (Mixamo, Unreal,
  Rigify, VRoid, Daz) y se arma un esqueleto normalizado.
- **Ilustración 2.5D** (`src/titere2d.js`): una imagen plana a la que se le anima cabeza,
  ojos y boca.

Todo esto ocurre en la PC del jugador. **La imagen de la webcam nunca sale de ahí.**

## 3. La cámara virtual

Para que Discord (o cualquier programa) vea al personaje, RolCam instala en Windows una
cámara virtual llamada "RolCam", basada en [Softcam](https://github.com/tshino/softcam),
un proyecto de código abierto (licencia MIT) que usa DirectShow, el sistema de cámaras de
Windows.

El recorrido de cada cuadro:

1. El escenario copia el dibujo a un lienzo de tamaño fijo (1280 × 720 o 640 × 360).
2. Lo manda al proceso principal.
3. El proceso principal se lo pasa a un programa auxiliar en C++, `rolcam-camara.exe`.
4. Ese programa lo entrega a Windows como si viniera de una cámara real.

El panel de controles no forma parte del dibujo, así que nunca sale en la cámara.

## 4. La sala: cómo se conectan las PC

La conexión tiene dos etapas (`src/sala.js`):

1. **Encontrarse.** Dos PC en internet no saben la dirección de la otra. Para presentarse
   usan servidores públicos de mensajes (relés de la red Nostr). Por ahí solo pasa el
   "apretón de manos", cifrado con el código de la sala.
2. **Hablar directo.** Una vez presentadas, abren una conexión WebRTC, la misma tecnología
   de las videollamadas en el navegador. Desde ahí los datos viajan de PC a PC, sin
   intermediarios. Es una arquitectura **de par a par** (P2P).

La librería [Trystero](https://github.com/dmotz/trystero) se encarga de las dos etapas.

**Qué viaja por la sala:**

| Dato | Quién lo escribe | Para qué |
| --- | --- | --- |
| Perfil | Cada participante | Rol, nombre del jugador y del personaje |
| Estado de la mesa | El Dungeon Master | Ambientes encendidos, fondo, vida de cada personaje |
| Efecto | El Dungeon Master | Aviso de un sonido que suena una vez |
| Archivo a pedido | El Dungeon Master responde | Imagen de fondo o sonido propio, cuando un jugador lo necesita |
| Vista del personaje | Cada jugador, solo hacia el DM | Video chico del personaje ya dibujado |

El **estado de la mesa** es un estado compartido: cuando el DM lo cambia, todos lo reciben
y lo obedecen (encienden la lluvia, cambian el fondo, muestran su vida).

**Ventajas y límites de este diseño:**

- No hay servidor que pagar ni mantener, lo que encaja con un proyecto gratuito.
- En redes muy cerradas la conexión directa puede fallar, porque no hay un servidor de
  respaldo (TURN).
- Hoy cualquier participante podría, técnicamente, escribir el estado de la mesa. Está
  pendiente restringirlo al DM.
- Pensado para mesas de 4 a 8 jugadores.

## 5. Las pantallas

- **Pantalla de inicio** (`src/inicio.js`): video de fondo en bucle, sonido de ambiente,
  elección de rol y entrada a la sala.
- **Escenario del jugador**: el personaje, el panel de controles y la vida que fija el DM.
- **Mesa del Dungeon Master**: mesa redonda con una carta por personaje (frente: personaje
  en vivo, vida y habilidades; dorso: sus sonidos), el fondo en el centro y un cajón de
  sonidos. Mientras está abierta no se dibuja el escenario 3D.

## 6. Sonido

Los ambientes y efectos incluidos (`src/sonidos.js`) no son archivos: se generan en el
momento con la Web Audio API, combinando ruido filtrado y osciladores. Por eso no hay
licencias de audio de terceros. Su carácter se ajustó midiendo grabaciones de referencia,
sin copiarlas. El DM puede sumar archivos propios (MP3, WAV, OGG).

## 7. Datos del usuario

Ajustes, personaje, fondo y sonidos propios se guardan en `%APPDATA%\rolcam\datos`, fuera
de la carpeta del programa, así sobreviven a una actualización.

## 8. Empaquetado y publicación

- El código está en GitHub con licencia GPL-3.0.
- `electron-builder` arma el instalador de Windows (NSIS), que además registra la cámara
  virtual.
- GitHub Actions, un servicio de automatización, hace el trabajo al subir una etiqueta de
  versión (por ejemplo `v1.7.0`): compila la cámara virtual, arma el instalador y lo
  publica en Releases. Eso se llama integración y entrega continua (CI/CD).

## Resumen de tecnologías

| Parte | Tecnología |
| --- | --- |
| Aplicación de escritorio | Electron (Chromium + Node.js) |
| Seguimiento del cuerpo | MediaPipe (tasks-vision) |
| Gráficos 3D | three.js, formato VRM (`@pixiv/three-vrm`), Kalidokit |
| Cámara virtual | Softcam (C++, DirectShow) |
| Conexión entre PC | WebRTC, con Trystero y relés Nostr |
| Sonido | Web Audio API |
| Instalador y publicación | electron-builder, NSIS, GitHub Actions |

Para lo que falta y las decisiones pendientes, ver [HOJA-DE-RUTA.md](HOJA-DE-RUTA.md).
