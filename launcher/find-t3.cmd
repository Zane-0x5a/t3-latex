@echo off
rem Prints the path of the installed T3 Code exe; prints nothing if there is
rem none. T3LATEX_T3_EXE, if set, is used as is.
rem
rem T3's installer (electron-builder) records the exe as "<exe>,0" in
rem DisplayIcon of its uninstall entry, and the folder as InstallLocation, under
rem the GUID it derives from T3's app id com.t3tools.t3code. Stable and Nightly
rem share that id but not the exe name ("T3 Code (Alpha).exe", "T3 Code
rem (Nightly).exe"), and the folder depends on when T3 was first installed
rem (Programs\t3-code-desktop for older installs, Programs\t3code now).
setlocal
if not defined T3LATEX_T3_EXE goto find
echo %T3LATEX_T3_EXE%
exit /b

:find
set "guid=e9197887-efb3-55e0-985e-d6d3b5dd594a"
set "exe="
for /f "tokens=2,*" %%a in ('reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\%guid%" /v DisplayIcon 2^>nul') do if "%%a"=="REG_SZ" set "exe=%%b"
rem (Substrings of an undefined variable garble the line, hence the goto.)
if not defined exe goto folder
if /i "%exe:~-6%"==".exe,0" set "exe=%exe:~0,-2%"
if exist "%exe%" goto found

:folder
rem DisplayIcon is an .ico instead if T3 ever ships an uninstaller icon.
set "exe="
set "dir="
for /f "tokens=2,*" %%a in ('reg query "HKCU\Software\%guid%" /v InstallLocation 2^>nul') do if "%%a"=="REG_SZ" set "dir=%%b"
if not defined dir exit /b 1
for %%f in ("%dir%\T3 Code*.exe") do set "exe=%%~ff"
if not defined exe exit /b 1

:found
echo %exe%
