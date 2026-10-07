@echo off
rem Starts T3 Code with LaTeX rendering (see ..\README.md).
rem Runs launch.cjs on T3's own Node, so nothing else needs to be installed.
setlocal
rem find-t3.cmd prints UTF-8, and a message below is Chinese: read both as such.
chcp 65001 >nul
set "exe="
for /f "delims=" %%e in ('call "%~dp0find-t3.cmd"') do set "exe=%%e"
if not defined exe goto missing
set ELECTRON_RUN_AS_NODE=1
rem The line is expanded before it runs, so exe is cleared before T3 starts
rem and T3 (and the terminals it opens) doesn't inherit it.
set "exe=" & "%exe%" "%~dp0launch.cjs" %*
exit /b

:missing
if defined T3LATEX_NO_DIALOG exit /b 1
rem Like launch.cjs, Chinese where the regional format is Chinese.
powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -Command "$text = if ((Get-Culture).Name -like 'zh*') { '没有找到 T3 Code。请先安装 T3 Code；如果它装在别处，把环境变量 T3LATEX_T3_EXE 设为它的 exe 路径。' } else { 'T3 Code was not found. Install T3 Code first; if it is installed somewhere else, set the environment variable T3LATEX_T3_EXE to its exe.' }; Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show($text, 'T3 Code (LaTeX)', 'OK', 'Warning') | Out-Null"
exit /b 1
