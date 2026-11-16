# RolCam — estado y hoja de ruta

Este archivo resume qué hace RolCam hoy, cómo está armado y qué falta, con el detalle
suficiente para que cualquier persona (o asistente) pueda retomar el desarrollo.

## Qué hace la versión 1.0

- Sigue cuerpo, cara y manos con una webcam común (MediaPipe) y anima un personaje.
- Personajes: VRM (completo, con expresiones), GLB y FBX con esqueleto humanoide
  (sin expresiones), o una ilustración convertida en personaje 2.5D.
- Fondo de color o imagen. Recuerda personaje, fondo y ajustes entre sesiones.
- Cámara virtual propia ("RolCam") visible en Discord, navegadores y otras apps.
- Modo liviano (sin dedos) para equipos modestos.
- Instalador para Windows armado en GitHub Actions.

## Cómo está armado

| Pieza | Archivo | Notas |
| --- | --- | --- |
| Proceso principal | `main.js` | Ventanas, protocolo `app://`, ajustes, cámara virtual |
| Puente | `preload.js` | Canales permitidos entre ventanas y proceso principal |
| Escenario | `src/escenario.js` | Dibujo (three.js), solver de brazos/torso/manos, filtros, interfaz |
| Seguimiento | `src/seguimiento.js` | Ventana oculta: webcam + MediaPipe en otro proceso |
| Importador | `src/importar.js` | GLB/FBX: mapeo de huesos por nombre, pose en T, esqueleto normalizado |
| Sala | `src/sala.js` | Conexión directa DM–jugadores con código; estado compartido y archivos a pedido |
| Sonidos del DM | `src/sonidos.js` | Ambientes y efectos sintetizados; ocho casilleros de audio propio |
| Personaje 2.5D | `src/titere2d.js` | Malla con relieve + shader de boca y párpados |
| Cámara virtual | `nativo/rolcam-camara.cpp` | Recibe cuadros RGBA por stdin y los pasa a Softcam |
| Compilación | `.github/workflows/` | `camara-virtual.yml` (componente nativo), `instalador.yml` (instalador) |

Decisiones de diseño que conviene respetar:

- **Dos procesos.** El seguimiento corre en una ventana oculta para que el dibujo siga
  fluido aunque el seguimiento vaya a pocos cuadros por segundo.
- **Objetivos + suavizado.** El seguimiento fija objetivos por hueso; el dibujo se acerca
  a ellos en cada cuadro. Antes, los puntos pasan por un filtro One Euro.
- **Mantener la última pose buena.** Con la muñeca fuera de cuadro, una mano sobre la
  cara o las manos superpuestas, no se usan los puntos dudosos.
- **Efecto espejo.** Los puntos de la cámara se invierten en x, y, z; la mano derecha
  real mueve la izquierda del personaje.
- **Esqueleto normalizado.** Todo personaje 3D se maneja como un humanoide VRM
  (`VRMHumanoid`), venga del formato que venga.
- **Licencias.** Proyecto GPL-3.0. Dependencias MIT o Apache 2.0. No se incluye código
  de proyectos con licencia no comercial.

## Pendiente, por prioridad

1. **Pruebas en una PC con placa dedicada.** Medir fps de dibujo y seguimiento; revisar
   espada/escudo en modelos de juegos (huesos sueltos) y el regreso de los brazos al reposo.
2. **Firma digital del instalador.** Desde la 1.1.0 el instalador registra la cámara
   virtual al instalar y la quita al desinstalar (`instalador/camara.nsh`); falta la
   firma para evitar el aviso de "editor desconocido" de Windows.
3. **Sala de la mesa (hecha en la 1.3.0, falta probarla entre redes distintas).**
   `src/sala.js` usa Trystero (WebRTC + relés Nostr públicos, sin servidor propio). Viajan:
   el perfil de cada uno, el estado "mesa" que fija el DM (ambientes, fondo, vidas), los
   efectos y los archivos que el DM entrega a pedido. Probado de punta a punta con dos
   ventanas y un relé local; sin probar con los relés públicos ni entre dos redes reales.
   No hay servidor TURN, así que en redes muy cerradas puede no conectar. Cualquiera en la
   sala podría escribir el estado "mesa": si hace falta, restringirlo con el sistema de
   roles de Trystero.
   Ideas ya pedidas para esa etapa:
   - **Ver a los personajes en el panel del DM** (su imagen en vivo, no solo la lista con
     nombre y vida). Trystero permite enviar video entre participantes (`room.addStream`).
   - **Sonidos incluidos por tipo de personaje** (hoy cada personaje tiene su botonera, pero
     solo con archivos que carga el DM).
   Hecho en la 1.4.0: vista del DM sin cámara ni personaje, y sonidos propios por personaje.
   Hecho en la 1.5.0: pantalla de inicio (`src/inicio.js`): mazmorra animada en un lienzo 2D,
   ambiente sonoro propio (`ambienteInicio` en `src/sonidos.js`: antorcha, viento leve y
   gritos lejanos), elección de rol y entrada a la sala u omitir. Pendiente: ajustar de
   oído los gritos lejanos, que se hicieron sin poder escucharlos. Se prueba sola con
   `ROLCAM_PRUEBA=1 ROLCAM_PRUEBA_INICIO=1`.
   Desde la 1.5.2 el fondo es un video que hizo Juan con Claude Opus 5.5 (`src/medios/mazmorra.webm`,
   recodificado a VP9 a 1280×720 y oscurecido un 16 %; el original ya cierra el bucle solo);
   el dibujo por código queda de respaldo. Los chasquidos del fuego se hicieron más
   espaciados y apagados en la 1.5.2, pero a Juan le gustaba más como estaban: en la 1.5.3
   volvieron a la versión original (va a pasar un audio de referencia para afinarlos).
   1.5.3: al elegir el rol suena un golpe fuerte (`tocarEntrada` en `src/sonidos.js`) y la
   imagen hace zoom con fundido a negro antes de mostrar el paso de conexión. Desde la 1.5.4
   pasa lo mismo al omitir, crear sala o entrar a una (en estos dos, cuando la conexión sale bien).
4. **Cambio de voz.** Empezar por cambio de tono simple. Bloqueante conocido: hace falta
   un micrófono virtual, y el más usado (VB-CABLE) no es open source.
5. **Generar el personaje 3D desde una imagen.** Flujo: imagen → malla (TRELLIS o
   TripoSR) → esqueleto automático (UniRig) → importador. Necesita placa dedicada y
   Python; va como módulo opcional. Verificar licencias en cada repositorio. El
   importador hoy reconoce huesos por nombre; para esqueletos generados hará falta
   reconocerlos por forma.
6. **Mejoras de personajes.** Expresiones para GLB/FBX (por ejemplo, brillo de ojos que
   se atenúa al parpadear), 52 expresiones de MediaPipe para VRM, boca guiada por el
   micrófono, fondos prearmados con licencia libre, guía de encuadre con vista previa
   de la cámara.
7. **Rendimiento.** Enviar los cuadros de la cámara virtual sin copiarlos varias veces
   (hoy pasan por IPC); actualizar las acciones de GitHub que avisan de Node obsoleto.

## Cómo probar sin cámara

Variables de entorno para pruebas automáticas (ver `main.js` y el final de
`src/escenario.js`): `ROLCAM_PRUEBA=1` arranca, inyecta un cuadro sintético y cierra;
`ROLCAM_CAPTURA=archivo.png` guarda una captura; `ROLCAM_PRUEBA_2D=frente|girado` prueba
el personaje 2.5D; `ROLCAM_CAMARA_FALSA=archivo.ppm` prueba la captura de la cámara virtual.
`ROLCAM_PRUEBA_SALA=ws://localhost:7777` abre una segunda ventana como jugador y prueba la
sala contra un relé Nostr local (hay que levantar uno aparte).
