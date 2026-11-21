@echo off
title Remove EKONI Windows Auto-Start
setlocal

set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

echo.
echo  Removing EKONI Auto-Start launchers from Windows Startup...
if exist "%STARTUP_DIR%\EkoniSQLStudio.vbs" (
  del /F /Q "%STARTUP_DIR%\EkoniSQLStudio.vbs"
  echo  [OK] Removed EkoniSQLStudio.vbs
) else (
  echo  [--] EkoniSQLStudio.vbs was not installed
)

if exist "%STARTUP_DIR%\EkoniUbuntuCLI.vbs" (
  del /F /Q "%STARTUP_DIR%\EkoniUbuntuCLI.vbs"
  echo  [OK] Removed EkoniUbuntuCLI.vbs
) else (
  echo  [--] EkoniUbuntuCLI.vbs was not installed
)

echo.
echo  Auto-start removed. Run stop-server.bat if you also want to stop currently running servers.
echo.
if "%1" NEQ "--nopause" pause
