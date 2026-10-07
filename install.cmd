@echo off
rem Double-click to add the "T3 Code (LaTeX)" shortcut to the Start menu and
rem the desktop (install.ps1 does the work).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
echo.
pause
