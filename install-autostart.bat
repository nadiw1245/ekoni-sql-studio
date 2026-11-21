@echo off
title EKONI Auto-Start Installer - Survives PC Shutdown, Reboot and Sleep
setlocal

set "APP_DIR=%~dp0"
if "%APP_DIR:~-1%"=="\" set "APP_DIR=%APP_DIR:~0,-1%"
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

echo.
echo  ==================================================================
echo   EKONI Localhost Auto-Start Setup (Task Scheduler + Startup)
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

echo  [OK] Installed Startup Launcher: EkoniSQLStudio.vbs - http://localhost:3344

powershell -NoProfile -Command "$u=\"$env:USERDOMAIN\$env:USERNAME\"; $a=New-ScheduledTaskAction -Execute \"$env:WINDIR\System32\wscript.exe\" -Argument '\"%APP_DIR%\start-silent.vbs\"'; $t=New-ScheduledTaskTrigger -AtLogOn -User $u; $s=New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew; $p=New-ScheduledTaskPrincipal -UserId $u -LogonType Interactive -RunLevel Limited; Register-ScheduledTask -TaskName 'EkoniSQLStudio' -Action $a -Trigger $t -Settings $s -Principal $p -Description 'Auto-starts EKONI SQL Studio on http://localhost:3344' -Force | Out-Null; Start-ScheduledTask -TaskName 'EkoniSQLStudio'"
echo  [OK] Registered Windows Scheduled Task: EkoniSQLStudio (runs independently on battery and AC)

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
  powershell -NoProfile -Command "$u=\"$env:USERDOMAIN\$env:USERNAME\"; $a=New-ScheduledTaskAction -Execute \"$env:WINDIR\System32\wscript.exe\" -Argument '\"%PARENT_DIR%\ubuntu-cli-terminal\start-silent.vbs\"'; $t=New-ScheduledTaskTrigger -AtLogOn -User $u; $s=New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew; $p=New-ScheduledTaskPrincipal -UserId $u -LogonType Interactive -RunLevel Limited; Register-ScheduledTask -TaskName 'EkoniUbuntuCLI' -Action $a -Trigger $t -Settings $s -Principal $p -Description 'Auto-starts EKONI Ubuntu CLI on http://localhost:3333' -Force | Out-Null; Start-ScheduledTask -TaskName 'EkoniUbuntuCLI'"
  echo  [OK] Registered Windows Scheduled Task: EkoniUbuntuCLI - http://localhost:3333
)

echo.
echo  DONE! EKONI SQL Studio now runs as an independent Windows background
echo  task that survives closing your IDE, sleep, shutdown, and reboot:
echo    - EKONI SQL Studio : http://localhost:3344
echo.
echo  To remove auto-start anytime, run: uninstall-autostart.bat
echo.
if "%1" NEQ "--nopause" pause
