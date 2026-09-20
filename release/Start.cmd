@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start.ps1" %*
set "salmon_exit=%ERRORLEVEL%"
pause
exit /b %salmon_exit%
