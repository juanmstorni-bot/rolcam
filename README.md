# RolCam (nombre provisional)

Programa de escritorio para jugar rol online con cámara: sigue tu cuerpo, cara y manos
con la webcam y muestra en tu lugar a tu personaje 3D. Software libre, licencia GPL-3.0.

Estado: **Fase 1, primer paso.** La app muestra el personaje y lo anima. La salida a
Discord se hace por ahora capturando la ventana con OBS (ver más abajo); la cámara
virtual propia viene después.

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

1. Se abre la ventana **RolCam — Escenario** con el personaje de ejemplo.
2. Tocá **Activar cámara**.
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

## Salida a Discord con OBS (puente temporal)

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
| `src/importar.js` | Importa modelos `.glb` / `.fbx`: reconoce los huesos y arma el esqueleto normalizado |
| `src/titere2d.js` | Personaje ilustrado 2.5D a partir de una imagen |
| `src/seguimiento.*` | Ventana oculta: abre la webcam y corre MediaPipe en un proceso aparte |
| `scripts/descargar-recursos.js` | Baja los modelos y el personaje de ejemplo a `recursos/` |

El seguimiento corre en un proceso separado del dibujo. Por eso el personaje se dibuja
fluido aunque el seguimiento vaya a pocos cuadros por segundo.

## Componentes de terceros

- [MediaPipe](https://github.com/google-ai-edge/mediapipe) — Apache 2.0
- [three.js](https://github.com/mrdoob/three.js) — MIT
- [@pixiv/three-vrm](https://github.com/pixiv/three-vrm) — MIT
- [Kalidokit](https://github.com/yeemachine/kalidokit) — MIT (cara y dedos)
- [Electron](https://github.com/electron/electron) — MIT
