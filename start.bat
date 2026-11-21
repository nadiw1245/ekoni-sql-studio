@echo off
title EKONI SQL Studio
cd /d "%~dp0"
echo Starting EKONI SQL Studio on http://localhost:3344 ...
start "" "http://localhost:3344"
node server.js
pause
