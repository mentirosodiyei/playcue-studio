# Módulo Bitfocus Companion para PlayCue Studio (v1.6.2)

Controla **PlayCue Studio** en directo desde Bitfocus Companion / Elgato StreamDeck con telemetría bidireccional en tiempo real, nombres dinámicos de vídeos, cuenta atrás con avisos de color y presets listos para arrastrar.

## Configuración de Conexión
- **Target IP**: `127.0.0.1` (o la IP del PC donde corre PlayCue Studio)
- **HTTP API Port**: `51080` (por defecto)
- **Polling Interval**: `250` ms

## Categorías de Presets incluidos
1. **1. TAKE y Transporte Master**:
   - Botón `TAKE (PRV -> PGM)` con transición programada, `CUT Directo`, `PLAY / PAUSE PGM`, `RELOJ CUENTA ATRÁS` (cambia automáticamente a Ámbar `<15s` y Rojo `<5s`), `-10s / -20s / -30s` y navegación de Cues.
2. **2. Lanzar Vídeos en PREVIO (PRV)**:
   - Botones para Cues 1 a 16 que muestran dinámicamente el nombre real del vídeo (`$(playcue:cue_1_name)`) y se iluminan en **Verde Esmeralda** cuando están cargados en Previo.
3. **3. Lanzar Vídeos DIRECTO A PROGRAMA (con Transición App)**:
   - Botones para Cues 1 a 16 que lanzan el vídeo directamente al aire ejecutando la transición programada en la app (`Cut`, `Mix`, `Dip`, `Wipe`) y se iluminan en **Rojo Tally** cuando están en Programa.
4. **4. Transiciones y Acción Final (End Action)**:
   - Selección rápida de tipo/duración de transición (`CUT`, `MIX`, `DIP`, `WIPE`, `0.5s`–`2.5s`) y comportamiento al terminar (`HOLD`, `BLACK`, `LOOP`, `PLAY NEXT`, `IR A`, `STOP`). Para cerrar bucles entre vídeos usa la acción **IR A** (elige el Nº de cue de destino) y luego el preset `AL TERMINAR: IR A…`.
5. **5. Salidas, Mosaico 4K, Emergencia y Audio**:
   - `BLACKOUT` (pausa el vídeo y lo reanuda al quitarlo), `FREEZE` (congela la imagen de salida mientras el clip sigue), `CARTA DE AJUSTE`, `PANIC` (= ESC: limpia la salida), activación de pantallas, conmutación de **Mosaico Horizontal `2×1`** / **Vertical `1×2`** / **Espejo Dual**, y control de volumen Master.
