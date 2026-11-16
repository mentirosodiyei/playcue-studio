# PlayCue Studio (v1.6.4)

Professional video player for live events on Windows, inspired by the workflow and design of **Mitti** and **PlaybackPro Plus**.

The app speaks **English, Spanish and Catalan**. It follows the Windows display language: Catalan systems get Catalan, Spanish systems get Spanish, and any other language gets English.

## What's new in v1.6.4

- **Adding videos is now visible and never silent**: a progress banner shows while files are added (big files can take a while while their audio is prepared), each clip appears as soon as it is ready, and any file that can't be added is reported with the reason (also written to the log). Dropping files that aren't videos now says so instead of doing nothing.

## v1.6.3

- **Scheduled show start**: in *Settings* choose *manual / when the app opens / a specific date and time / every day at a time*; the show then enables the outputs and launches the first cue by itself. The schedule is saved with the show. Optional *start the app with the system* (installed or portable build).
- **Precise playback errors**: when a clip can't be played the app now says exactly why (file not found, no permission, empty file, damaged file, unsupported format, read error) in the Cue List, the inspector and over the monitor.

## v1.6.2

- **Automatic updates** (see below), **Catalan / Spanish / English UI**, per-project logs and the installer.

## v1.6.1

- **"Go to" end action**: a cue can jump to a specific cue when it ends (`END ACTION → GO TO`), so you can close loops between several videos (A → B → A…). Remote: `/cue/goto <n>` (OSC/HTTP).
- **Always the most powerful GPU**: the app detects the installed graphics adapters and uses the dedicated one if present, or the integrated one if it is the only option. It registers itself in *Windows Graphics settings* as "High performance".
- **Real VU meters** (Web Audio), working gain above 0 dB, the BLACK end action's black is cleared by the next TAKE, timecode that follows each video's fps, and playback error notices.
- **Blackout pauses the video** and resumes it when released (PLAY also releases it). **Freeze** holds the picture on the output while the clip keeps running underneath (clock and audio continue). **ESC = clear output**: it stops and unloads the program (also from the output window) and does not trigger blackout.
- **Cue List multi-select**: Shift (range), Ctrl (add/remove), Ctrl+A, move and delete several cues at once (right-click or the Del key). *Locate* only works for a single file.
- **Settings** (formerly "Mosaic"): displays, output mode, **audio output** (System default is the base option) and a virtual canvas preview with the real aspect ratio. Display selection is no longer in the top bar.
- **macOS-style sliders and scrollbars**, its own icon in the exe / window / tray, and **closing with the X sends the app to the system tray** (quit from the tray icon → *Quit*).
- **Installer** (`PlayCue_Studio_Setup_<version>.exe`): if a version is already installed it installs over it, keeping your projects and settings. You can run the installer of an older version to go back. A portable build is also provided.
- **Automatic updates**: the app checks the latest GitHub release every few hours (and at startup). If a newer version exists it asks you: *Download and install*, *Later* or *Skip this version*. On Windows (installed build) it downloads the installer, verifies it and installs over the current version; on macOS and the portable build it opens the download page. It never interrupts a running show, and the check can be turned off or run manually in *Settings*.
- **Per-project log**: `%APPDATA%\PlayCue Studio\logs\<project>\<YYYY-MM-DD>.log` (startup, TAKE, blackout/freeze/ESC, video errors, unhandled errors, open/save failures). Files older than 30 days are deleted automatically. Quick access: tray icon → *Open logs folder*.

## Main features (v1.3.0)

- **Output scaling, aspect ratio, zoom and a 90% blur background layer**:
  - **True fullscreen**: automatically fits `1920x1080` videos to `2560x1440`, `4K` or custom LED formats.
  - **Enlarged video + 90% blur underlay**: one-click option (`BLUR BACKGROUND 90%`) that creates a synchronized, full-screen, gaussian-blurred layer (adjustable blur, brightness and zoom) under the sharp original video.
  - **Live aspect ratio and zoom control**: `Native`, `Fit to output`, `16:9`, `16:10`, `4:3`, `21:9`, `32:9`, `9:16`, `1:1`, `FIT / FILL / STRETCH` modes, **zoom (`50%` to `300%`)**, independent X/Y scale, X/Y position, and a button to apply the format to every video in the list.
- **Dual monitors + central transition console**:
  - `PREVIEW (PRV)` with visual `IN / OUT` trim, frame-by-frame stepping (`-1f / +1f`), pre-listening (*Audition*) and a `-10s` jump.
  - `TAKE` with real-time transitions (`Cut`, `Cross-Dissolve / Mix`, `Dip to Black`, `Wipe`), `BLACKOUT`, `FREEZE` and an `SMPTE TEST PATTERN`.
  - `PROGRAM (PGM)` with a dual-deck engine (`Deck A / Deck B`), a countdown clock with color alerts (`< 15s` amber, `< 5s` red), `-30s / -20s / -10s` buttons and real-time stereo L/R VU meters.
- **Synchronized multi-display mosaic (v1.1.0)**:
  - Real-time detection of every connected output, including **custom EDID formats** from LED processors (true physical pixel resolution, DPI scale and Hz).
  - **Single output**, **Horizontal mosaic (`2×1`)**, **Vertical mosaic (`1×2`)** and **Dual mirror (`Clone 1+2`)** modes.
  - **Single VRAM surface (*Spanned window*)**, NVIDIA-Mosaic style, with UV-region viewport slicing, output swapping (`1 ↔ 2`) and pixel *overlap*.
- **Cue List and 4-tab inspector**:
  - Per-clip end actions: `HOLD (pause at end)`, `BLACK (go to black)`, `LOOP`, `PLAY NEXT (auto-follow)`, `GO TO` and `STOP`.
  - Audio gain in dB, audio/video *Fade In / Out*, geometry (*Fit / Fill / Stretch*, rotation, H/V mirror) and speed (`0.5x`–`2x`).
- **Built-in FFmpeg & FFprobe**:
  - Automatic codec analysis, thumbnail extraction, 1080p50 demo clip generation and conversion to a **Broadcast H.264 proxy (`-g 15`)**.
- **Bitfocus Companion / StreamDeck remote control**:
  - **OSC UDP** server (port `51000`) and **HTTP REST API** (port `51080`). A native Companion module is bundled.

## Support

Found a problem? Please report it on the project page: <https://github.com/mentirosodiyei/playcue-studio>

## Development and packaging

```bash
pnpm install
pnpm run build
pnpm run dist
```

To test another language, start the app with `--lang=ca`, `--lang=es` or `--lang=en`.

Author: David Redondo García.
