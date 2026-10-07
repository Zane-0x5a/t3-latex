<#
Removes what install.ps1 added: the "T3 Code (LaTeX)" shortcuts. Also clears
t3-latex's logs in %TEMP%\t3-latex. T3 Code itself was never changed, so
nothing else needs undoing; start T3 from its own icon as before.

  powershell -ExecutionPolicy Bypass -File uninstall.ps1
  powershell -ExecutionPolicy Bypass -File uninstall.ps1 -Destination <folder>   (tests)
#>
param([string[]]$Destination)
$ErrorActionPreference = 'Stop'

if (-not $Destination) {
  $Destination = @([Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('Desktop'))
  # The shortcuts' icon (install.ps1 copies it from T3); a test run with
  # -Destination leaves it for the real shortcuts.
  $icon = Join-Path $PSScriptRoot 'launcher\t3.ico'
  if (Test-Path $icon) {
    Remove-Item $icon
    "removed  $icon"
  }
}
foreach ($dir in $Destination) {
  $path = Join-Path $dir 'T3 Code (LaTeX).lnk'
  if (Test-Path $path) {
    Remove-Item $path
    "removed  $path"
  }
}
$state = Join-Path $env:TEMP 't3-latex'
if (Test-Path $state) {
  Remove-Item $state -Recurse -Force -ErrorAction SilentlyContinue
  "removed  $state"
}
