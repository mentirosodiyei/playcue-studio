@echo off
title PlayCue Studio - Broadcast Video Playback
cd /d "%~dp0"
set "PATH=C:\Program Files\Companion\resources\node-runtimes\node22;%PATH%"
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
