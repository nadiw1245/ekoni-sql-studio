@echo off
title Stop EKONI Localhost Servers
setlocal

echo.
echo  Stopping EKONI SQL Studio (3344) and EKONI Ubuntu CLI (3333)...
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and ($_.CommandLine -match 'ekoni-sql-studio' -or $_.CommandLine -match 'ubuntu-cli-terminal') } | ForEach-Object { Write-Host ('  [STOP] PID ' + $_.ProcessId + ' -> ' + $_.CommandLine); Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
echo.
echo  All EKONI localhost servers stopped.
echo.
if "%1" NEQ "--nopause" pause
