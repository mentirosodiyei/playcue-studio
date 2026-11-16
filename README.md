# PlayCue Studio (v1.6.1)

Reproductor profesional de vídeo para eventos en directo en Windows, inspirado en el flujo de trabajo y diseño de **Mitti** y **PlaybackPro Plus**.

## Novedades v1.6.1

- **Acción "IR A" al terminar**: un cue puede saltar a otro cue concreto cuando acaba (`END ACTION → IR A`), lo que permite cerrar bucles entre varios vídeos (A → B → A…). Remoto: `/cue/goto <n>` (OSC/HTTP).
- **GPU siempre la más potente**: se detectan las gráficas del equipo y se usa la dedicada si existe, o la integrada si es la única. La app se registra en *Configuración gráfica de Windows* como "Alto rendimiento".
- **Vúmetros reales** con Web Audio, ganancia por encima de 0 dB funcional, el negro de la acción BLACK se quita con el siguiente TAKE, timecode según los fps del vídeo y avisos de error de reproducción.

- **Blackout pausa el vídeo** y lo reanuda al quitarlo (PLAY también lo quita). **Freeze** congela la imagen en la salida mientras el clip sigue corriendo debajo (reloj y audio continúan). **ESC = limpiar salida**: detiene y descarga el programa (también en la ventana de salida); no activa el blackout.
- **Cue List con multiselección**: Shift (rango), Ctrl (añadir/quitar), Ctrl+A, mover y eliminar varios a la vez (botón derecho o tecla Supr). *Locate* solo para un archivo.
- **Configuración** (antes "Mosaico"): pantallas, modo de salida, **salida de audio** (Predeterminado del sistema por defecto) y lienzo virtual con la proporción real. La selección de pantalla ya no está en la barra superior.
- **Sliders estilo macOS**, icono propio en exe/ventana/bandeja y **cierre con la X a la bandeja del sistema** (salir desde el icono de la bandeja → *Salir*).

- **Instalador** (`PlayCue_Studio_Setup_<versión>.exe`): si ya hay una versión instalada se instala encima conservando proyectos y ajustes; se puede instalar una versión anterior para volver atrás.
- **Log por proyecto**: `%APPDATA%\PlayCue Studio\logs\<proyecto>\<AAAA-MM-DD>.log` (arranque, TAKE, blackout/freeze/ESC, errores de vídeo, errores no controlados, fallos de abrir/guardar). Los archivos de más de 30 días se borran solos. Acceso rápido: icono de la bandeja → *Abrir carpeta de logs*.

## Características principales (v1.3.0)

- **Escalado en Salida, Aspect Ratio, Zoom y Capa Fondo Blur 90% (v1.3.0)**:
  - **Pantalla Completa Real**: Ajusta automáticamente vídeos `1920x1080` a salidas `2560x1440`, `4K` o formatos LED personalizados.
  - **Capa Inferior con Vídeo Ampliado + Blur 90%**: Opción en 1 clic (`FONDO BLUR 90%`) para generar una capa inferior sincronizada con el propio vídeo ampliado a pantalla completa y desenfoque gaussiano al `90%` (ajustable en nivel de blur, brillo y zoom) con el vídeo en su formato original nítido por encima.
  - **Control de Aspect Ratio y Zoom en Vivo**: Selección de relación de aspecto (`Nativo`, `Adaptar a Salida`, `16:9`, `16:10`, `4:3`, `21:9`, `32:9`, `9:16`, `1:1`), modos `FIT / FILL / STRETCH`, **Zoom (`50%` a `300%`)**, escala independiente X/Y, posición X/Y y botón para aplicar el formato a todos los vídeos de la escaleta.
- **Doble Monitor en Cabina + Consola Central de Transición**:
  - `PREVIEW (PRV)` con recorte visual `IN / OUT`, avance fotograma a fotograma (`-1f / +1f`), escucha previa (*Audition*) y salto `-10s`.
  - `TAKE` con transiciones en tiempo real (`Cut`, `Cross-Dissolve / Mix`, `Dip to Black`, `Wipe`), `BLACKOUT`, `FREEZE` y `CARTA DE AJUSTE SMPTE`.
  - `PROGRAM (PGM)` con motor Dual-Deck (`Deck A / Deck B`), reloj de cuenta atrás con alertas de color (`< 15s` ámbar, `< 5s` rojo), botones `-30s / -20s / -10s` y vúmetros estéreo L/R en tiempo real.
- **Mosaico Multipantalla Síncrono (v1.1.0)**:
  - Detección en tiempo real de todas las salidas conectadas a Windows, incluyendo **Formatos Custom EDID** de procesadores LED (resolución física real en píxeles, escala DPI y Hz).
  - Modos **1 Salida Única**, **Mosaico Horizontal (`2×1`)**, **Mosaico Vertical (`1×2`)** y **Doble Espejo (`Clon 1+2`)**.
  - Soporte de **Superficie Única en VRAM (*Spanned Window*)** estilo NVIDIA Mosaic y recorte por regiones UV (*Viewport Slicing*) con inversión de salidas (`1 ↔ 2`) y *Overlap* en píxeles.
- **Escaleta / Cue List e Inspector de 4 Pestañas**:
  - Acciones finales por clip: `HOLD (Pause at End)`, `BLACK (Ir a negro)`, `LOOP`, `PLAY NEXT (Auto-Follow)` y `STOP`.
  - Ajustes de ganancia de audio en dB, *Fade In / Out* de audio y vídeo, geometría (*Fit / Fill / Stretch*, rotación, espejo H/V) y velocidad (`0.5x`–`2x`).
- **FFmpeg & FFprobe Integrados**:
  - Análisis automático de códecs, extracción de miniaturas, generación de clips demo 1080p50 y conversión a **Proxy H.264 Broadcast (`-g 15`)**.
- **Control Remoto Bitfocus Companion / StreamDeck**:
  - Servidor **OSC UDP** (puerto `51000`) y **API HTTP REST** (puerto `51080`).

## Desarrollo y Empaquetado

```bash
pnpm install
pnpm run build
pnpm run dist
```
