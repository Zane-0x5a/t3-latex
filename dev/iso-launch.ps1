# Runs a command the way the "T3 Code (LaTeX)" shortcut would, but against the
# isolated test T3 (scratch/iso): clean environment, own APPDATA / T3CODE_HOME / TEMP,
# auto update off, dialogs logged instead of shown.
#
#   powershell -File dev/iso-launch.ps1                 # shortcut command line
#   powershell -File dev/iso-launch.ps1 -Plain          # plain T3, no launcher
#   powershell -File dev/iso-launch.ps1 -Dialog         # really show message boxes
param([switch]$Plain, [switch]$Dialog)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$iso = Join-Path $root 'scratch\iso'
Get-ChildItem env: | Where-Object { $_.Name -match '^(CLAUDE|ELECTRON_|T3CODE_|T3LATEX_|NODE_OPTIONS$|NO_COLOR$)' } |
  ForEach-Object { Remove-Item "env:$($_.Name)" }
$env:APPDATA = Join-Path $iso 'appdata'
$env:T3CODE_HOME = Join-Path $iso 'home'
$env:TEMP = $env:TMP = Join-Path $iso 'tmp'
New-Item -ItemType Directory -Force $env:TEMP | Out-Null
$env:T3CODE_DISABLE_AUTO_UPDATE = '1'
$env:T3CODE_DESKTOP_APP_USER_MODEL_ID = 'com.t3tools.t3code.t3latex-test'
if (-not $Dialog) { $env:T3LATEX_NO_DIALOG = '1' }
if ($Plain) {
  [Console]::OutputEncoding = [Text.Encoding]::UTF8   # find-t3.cmd prints UTF-8
  $t3 = & (Join-Path $root 'launcher\find-t3.cmd') | Select-Object -First 1
  Start-Process -FilePath $t3
} else {
  $cmd = Join-Path $root 'launcher\t3-latex.cmd'
  Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\conhost.exe') -ArgumentList '--headless', 'cmd.exe', '/d', '/c', "`"$cmd`""
}

