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
3. **Sala del Dungeon Master.** Desde la 1.2.0 hay un panel local de sonidos
   (`src/sonidos.js`: ambientes y efectos generados con Web Audio, más archivos propios)
   que los jugadores oyen si el DM comparte la ventana con sonido. Lo que falta requiere una "sala": las apps de la mesa conectadas por
   un código. El DM cambia el fondo de todos y dispara sonidos que suenan en la app de
   cada jugador. Decisión abierta: conexión directa entre jugadores (WebRTC, sin
   servidor propio) o servidor mínimo de retransmisión.
   Ideas ya pedidas para esa etapa:
   - **Modo Dungeon Master sin cámara.** El DM no es un personaje: su versión no necesita
     seguimiento ni cámara virtual, solo el panel de dirección. Hoy el rol (jugador / DM)
     solo oculta o muestra el panel de sonidos; falta separar del todo las dos vistas.
   - **Personajes de la mesa en el panel del DM**, con nombre del jugador, nombre del
     personaje y puntos de vida, y la posibilidad de cambiarles el fondo.
   - **Sonidos por personaje.** Debajo de cada personaje, su propia botonera: un mago con
     hechizos y portales, un guerrero con desenvainar y golpes de espada, etc.
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
