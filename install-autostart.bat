@echo off
title EKONI Auto-Start Installer - Survives PC Shutdown and Restart
setlocal

set "APP_DIR=%~dp0"
if "%APP_DIR:~-1%"=="\" set "APP_DIR=%APP_DIR:~0,-1%"
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

echo.
echo  ==================================================================
echo   EKONI Localhost Auto-Start Setup (Windows Startup)
echo  ==================================================================
echo.

if not exist "%STARTUP_DIR%" mkdir "%STARTUP_DIR%"

(
  echo ' EKONI SQL Studio - Auto-Start Launcher
  echo Option Explicit
  echo Dim fso, sh, nodeExe
  echo Set fso = CreateObject^("Scripting.FileSystemObject"^)
  echo Set sh = CreateObject^("WScript.Shell"^)
  echo nodeExe = "C:\Program Files\nodejs\node.exe"
  echo If Not fso.FileExists^(nodeExe^) Then nodeExe = "node.exe"
  echo If fso.FileExists^("%APP_DIR%\server.js"^) Then
  echo   sh.CurrentDirectory = "%APP_DIR%"
  echo   sh.Run """" ^& nodeExe ^& """ ""%APP_DIR%\server.js""", 0, False
  echo End If
) > "%STARTUP_DIR%\EkoniSQLStudio.vbs"

echo  [OK] Installed Startup Launcher: EkoniSQLStudio.vbs  - http://localhost:3344

for %%I in ("%APP_DIR%\..") do set "PARENT_DIR=%%~fI"
if exist "%PARENT_DIR%\ubuntu-cli-terminal\server.js" (
  (
    echo ' EKONI Ubuntu CLI - Auto-Start Launcher
    echo Option Explicit
    echo Dim fso, sh, nodeExe
    echo Set fso = CreateObject^("Scripting.FileSystemObject"^)
    echo Set sh = CreateObject^("WScript.Shell"^)
    echo nodeExe = "C:\Program Files\nodejs\node.exe"
    echo If Not fso.FileExists^(nodeExe^) Then nodeExe = "node.exe"
    echo If fso.FileExists^("%PARENT_DIR%\ubuntu-cli-terminal\server.js"^) Then
    echo   sh.CurrentDirectory = "%PARENT_DIR%\ubuntu-cli-terminal"
    echo   sh.Run """" ^& nodeExe ^& """ ""%PARENT_DIR%\ubuntu-cli-terminal\server.js""", 0, False
    echo End If
  ) > "%STARTUP_DIR%\EkoniUbuntuCLI.vbs"
  echo  [OK] Installed Startup Launcher: EkoniUbuntuCLI.vbs  - http://localhost:3333
)

echo.
echo  Starting server now in silent background mode...
wscript.exe "%STARTUP_DIR%\EkoniSQLStudio.vbs"
if exist "%STARTUP_DIR%\EkoniUbuntuCLI.vbs" wscript.exe "%STARTUP_DIR%\EkoniUbuntuCLI.vbs"

echo.
echo  DONE! Every time you shutdown or restart Windows, your localhost
echo  workspace will boot automatically with zero console popups:
echo    - EKONI SQL Studio : http://localhost:3344
echo.
echo  To remove auto-start anytime, run: uninstall-autostart.bat
echo.
if "%1" NEQ "--nopause" pause
