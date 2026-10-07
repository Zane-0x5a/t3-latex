@echo off
rem Double-click to remove what install.cmd added (uninstall.ps1 does the work).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1"
echo.
pause
