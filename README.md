# CuePro Studio (v1.2.1)

Reproductor profesional de vídeo para eventos en directo en Windows, inspirado en el flujo de trabajo y diseño de **Mitti** y **PlaybackPro Plus**.

## Características principales (v1.2.1)

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
