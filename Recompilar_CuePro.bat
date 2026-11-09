@echo off
title Recompilar CuePro Studio
cd /d "%~dp0"
set "PATH=C:\Program Files\Companion\resources\node-runtimes\node22;%PATH%"
echo Compilando interfaz React (Vite)...
node .\node_modules\vite\bin\vite.js build
echo Compilando motor Electron...
node .\node_modules\typescript\bin\tsc -p tsconfig.electron.json
echo Listo! Iniciando CuePro Studio...
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
pause
