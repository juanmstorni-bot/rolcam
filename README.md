# RolCam

Programa de escritorio para jugar rol online con cámara: sigue tu cuerpo, cara y manos
con la webcam y muestra en tu lugar a tu personaje 3D. Software libre, licencia GPL-3.0.

Estado: **en desarrollo.** La app anima personajes VRM, GLB y FBX, o una ilustración,
y los emite por su propia cámara virtual.

## Instalar (para usar el programa)

Descargá el instalador `RolCam Setup` desde el repositorio (pestaña Actions, flujo
"Instalador", sección Artifacts) y ejecutalo. Windows puede mostrar una advertencia
porque el instalador todavía no tiene firma digital.

El instalador pide permiso de administrador porque registra la cámara virtual "RolCam"
en Windows; al desinstalar el programa, la quita. Si la cámara no aparece en Discord,
dentro de RolCam está el botón **Instalar cámara virtual en Windows** para repetirlo a mano.

Lo que sigue en este archivo es para quien quiera modificar el programa.

## Requisitos

- Windows 10 u 11 de 64 bits
- [Node.js](https://nodejs.org) versión LTS (incluye `npm`)
- Una webcam
- Internet solo para la instalación

## Instalación

Abrí una terminal en esta carpeta (en VS Code: menú Terminal > Nueva terminal) y corré:

```
npm install
```

Esto descarga Electron, las librerías, los modelos de seguimiento y un personaje de
ejemplo (unos 350 MB en total; en una PC lenta puede tardar varios minutos).

Si al final dice que faltan archivos, repetí solo esa parte con:

```
npm run recursos
```

## Uso

```
npm start
```

1. Se abre la **pantalla de inicio** (una mazmorra con antorchas, con sonido de ambiente).
   Ahí elegís tu rol, **Jugador** o **Dungeon Master**, y después entrás a una sala o
   tocás **Omitir por ahora**. El sonido se apaga con el botón de abajo a la derecha.
2. Ya en el escenario, tocá **Activar cámara**.
3. Para usar tu personaje, arrastrá a la ventana un archivo `.vrm`, `.glb` o `.fbx`.
   - `.vrm` es el formato más completo: incluye expresiones de cara (boca, parpadeo).
   - `.glb` y `.fbx` sirven si el modelo tiene esqueleto humanoide con nombres de hueso
     estándar (Mixamo, Unreal, Blender/Rigify, VRoid, Daz y similares). La app lo gira,
     lo escala y lo lleva a pose en T sola. Estos formatos no traen expresiones de cara.
4. Para poner un fondo, arrastrá una imagen (PNG, JPG o WebP) o elegila en el panel.
5. La tecla **H** oculta o muestra el panel de controles.

### Personaje ilustrado desde una imagen (2.5D)

Si no tenés un modelo 3D, podés usar una ilustración de tu personaje:

1. En el panel, elegí la imagen en **Personaje desde una imagen** (o arrastrala a la ventana
   y elegí "Como personaje"). Conviene una imagen de frente, de la cintura para arriba.
2. Marcá sobre la imagen la cara (círculo amarillo), los ojos (celestes) y la boca (rosa).
3. Si la imagen tiene un fondo de un solo color, dejá tildado "Quitar fondo liso". Lo ideal es
   un PNG con fondo transparente.
4. Tocá **Listo**.

El personaje gira e inclina la cabeza, se mueve con tus hombros, parpadea, abre la boca y
respira. Esta primera versión no mueve los brazos. Los marcadores se pueden corregir después
con "Ajustar marcadores del personaje".

La app recuerda tu personaje, tu fondo y tus ajustes. Se guardan en
`%APPDATA%\rolcam\datos`, fuera de la carpeta del programa.

En el panel se ven los fps de dibujo y de seguimiento. Los mensajes de error de las dos
ventanas aparecen en la terminal donde corriste `npm start`.

## Panel del Dungeon Master

Al abrir RolCam por primera vez se elige **Jugador** o **Dungeon Master** (se cambia después
en "Uso de RolCam"). Es el mismo programa; el jugador simplemente no ve este panel.

El Dungeon Master no es un personaje, así que su ventana no usa cámara ni muestra un
personaje: solo el fondo y los paneles de dirección. Si quiere aparecer en cámara, tilda
**Usar también cámara y personaje**.

El panel tiene dos listas:

- **Ambientes**, que se repiten hasta apagarlos y se pueden combinar: lluvia, viento
  fuerte, fogata, tormenta (con rayos y truenos) y tambores de guerra.
- **Efectos**, que suenan una vez: trueno, campana y magia misteriosa.

En cada lista, **+ Agregar** suma un archivo propio (MP3, WAV, OGG): en Ambientes se repite
en bucle, en Efectos suena una vez. Con **Editar listas** se quita cualquier sonido, incluido
o propio; los incluidos se recuperan con un botón.

Los sonidos incluidos se generan por código, sin archivos de terceros. Su carácter se ajustó
midiendo grabaciones de referencia (qué graves, qué ritmo, cuánto duran), sin copiarlas.

Para que los jugadores los escuchen, el DM comparte la ventana de RolCam **con sonido** en
Discord. Todavía no hay una "sala" que conecte los programas de la mesa (ver hoja de ruta).

## Sala de la mesa

La sala conecta el RolCam del Dungeon Master con los de los jugadores:

1. El DM escribe su nombre y toca **Crear sala nueva**. Aparece un código de seis letras.
2. Cada jugador escribe su nombre, el de su personaje y el código, y toca **Entrar con ese
   código**.

Con la sala abierta, lo que hace el DM llega a todos:

- Los **ambientes y efectos** suenan en el programa de cada jugador (también los archivos
  propios del DM, que se envían la primera vez que hacen falta).
- **Poner mi fondo a toda la mesa** aplica el fondo del DM a todos los personajes.
- El DM ve la **lista de la mesa** y lleva los **puntos de vida** de cada personaje; cada
  jugador ve los suyos.
- Debajo de cada personaje, el DM puede cargarle **sonidos propios** con "+ Sonido" (un
  hechizo para el mago, una espada para el guerrero). Quedan guardados con el nombre del
  personaje y suenan para toda la mesa.

La conexión es directa entre los programas, sin servidor propio. Para encontrarse usan
servidores públicos (relés Nostr, a través de la librería Trystero); por ahí solo pasa el
saludo inicial, cifrado con el código de la sala. En algunas redes muy cerradas la conexión
directa puede no establecerse.

## Cámara virtual propia

RolCam trae su propia cámara virtual, para no depender de OBS. Aparece en Discord y otras
apps con el nombre **RolCam**.

El componente nativo se compila solo en GitHub (pestaña **Actions**, flujo "Camara virtual"):

1. En GitHub, abrí la última ejecución de "Camara virtual" y descargá el archivo
   **rolcam-camara** (sección Artifacts).
2. Descomprimilo dentro de `nativo/bin`, de modo que exista
   `nativo/bin/x64/rolcam-camara.exe`.
3. Abrí RolCam y tocá **Instalar cámara virtual en Windows** (una sola vez; Windows pide
   permiso de administrador).
4. Tocá **Iniciar cámara virtual** y elegí la cámara "RolCam" en Discord. Si Discord ya
   estaba abierto, reinicialo.

Si movés la carpeta del programa, hay que instalar la cámara de nuevo: Windows guarda la
ubicación del componente. El panel de controles nunca sale en la cámara.

## Salida a Discord con OBS (alternativa)

1. Instalá [OBS Studio](https://obsproject.com).
2. En OBS: Fuentes > **+** > **Captura de ventana** > elegí "RolCam — Escenario".
   Si se ve negro, cambiá el método de captura a "Windows 10 (1903 y superior)".
3. En RolCam apretá **H** para ocultar el panel.
4. En OBS tocá **Iniciar cámara virtual**.
5. En Discord: Ajustes > Voz y video > Cámara > **OBS Virtual Camera**.

## Cómo está armado

| Archivo | Qué hace |
| --- | --- |
| `main.js` | Proceso principal de Electron: crea las dos ventanas y retransmite mensajes |
| `preload.js` | Puente seguro entre las ventanas y el proceso principal |
| `src/escenario.*` | Ventana visible: dibuja el personaje y convierte puntos en movimiento de huesos |
| `src/inicio.js` | Pantalla de inicio: video de mazmorra en bucle (con un dibujo por código de respaldo), elección de rol y entrada a la sala |
| `src/medios/mazmorra.webm` | Video de fondo de la pantalla de inicio, hecho por el autor del proyecto con Claude Opus 5.5 (VP9, sin audio; el sonido se genera aparte) |
| `src/importar.js` | Importa modelos `.glb` / `.fbx`: reconoce los huesos y arma el esqueleto normalizado |
| `src/sala.js` | Sala de la mesa: conexión directa entre el DM y los jugadores |
| `src/sonidos.js` | Sonidos del panel del Dungeon Master, generados por código |
| `src/titere2d.js` | Personaje ilustrado 2.5D a partir de una imagen |
| `src/seguimiento.*` | Ventana oculta: abre la webcam y corre MediaPipe en un proceso aparte |
| `nativo/rolcam-camara.cpp` | Programa auxiliar que pasa los cuadros a la cámara virtual |
| `.github/workflows/camara-virtual.yml` | Compila la cámara virtual en GitHub |
| `scripts/descargar-recursos.js` | Baja los modelos y el personaje de ejemplo a `recursos/` |

El seguimiento corre en un proceso separado del dibujo. Por eso el personaje se dibuja
fluido aunque el seguimiento vaya a pocos cuadros por segundo.

## Componentes de terceros

- [MediaPipe](https://github.com/google-ai-edge/mediapipe) — Apache 2.0
- [three.js](https://github.com/mrdoob/three.js) — MIT
- [@pixiv/three-vrm](https://github.com/pixiv/three-vrm) — MIT
- [Kalidokit](https://github.com/yeemachine/kalidokit) — MIT (cara y dedos)
- [Electron](https://github.com/electron/electron) — MIT
- [Softcam](https://github.com/tshino/softcam) — MIT (cámara virtual)
- [Trystero](https://github.com/dmotz/trystero) — MIT (conexión entre jugadores)
- Personaje de ejemplo: VRM1_Constraint_Twist_Sample, (c) 2022 pixiv Inc., redistribuible según su licencia VRM

El estado del proyecto y lo que falta están en [docs/HOJA-DE-RUTA.md](docs/HOJA-DE-RUTA.md).
