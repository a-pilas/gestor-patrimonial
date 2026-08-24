@echo off
cd /d "%~dp0"
start "Gestor patrimonial - servidor (no cerrar mientras uses la app)" cmd /k "python -m http.server 5500"
timeout /t 2 /nobreak >nul
start "" http://localhost:5500/
