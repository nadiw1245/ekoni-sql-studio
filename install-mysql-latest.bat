@echo off
title Install Latest Official Oracle MySQL Server and Shell (winget)
setlocal

echo.
echo  ==================================================================
echo   Install Official Oracle MySQL Server + MySQL Shell via winget
echo  ==================================================================
echo.
echo  This installs the latest official Oracle MySQL release on Windows
echo  so you can connect EKONI SQL Studio to a live MySQL instance
echo  on 127.0.0.1:3306 (in addition to the built-in MySQL 9.7 compat engine).
echo.

where winget >nul 2>&1
if errorlevel 1 (
  echo  [ERROR] winget was not found on this PC.
  echo  Download official MySQL 9.7 LTS / 8.4 LTS directly from:
  echo    https://dev.mysql.com/downloads/mysql/
  pause
  exit /b 1
)

echo  Installing Oracle.MySQL ...
winget install --id Oracle.MySQL -e --accept-package-agreements --accept-source-agreements
echo.
echo  Installing Oracle.MySQLShell ...
winget install --id Oracle.MySQLShell -e --accept-package-agreements --accept-source-agreements

echo.
echo  ==================================================================
echo   Next Step:
echo   1. Open EKONI SQL Studio at http://localhost:3344
echo   2. Click the "Connections" button in the top bar
echo   3. Connect to 127.0.0.1:3306 (or click "Start Local XAMPP MySQL")
echo  ==================================================================
echo.
pause
