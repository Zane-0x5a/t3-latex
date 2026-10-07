<#
Removes what install.ps1 added: the "T3 Code (LaTeX)" shortcuts and the
t3-visualize skill. Also clears t3-latex's logs in %TEMP%\t3-latex. T3 Code
itself was never changed, so nothing else needs undoing; start T3 from its own
icon as before.

  powershell -ExecutionPolicy Bypass -File uninstall.ps1
  powershell -ExecutionPolicy Bypass -File uninstall.ps1 -Destination <folder> -Skills <folder>   (tests)
#>
param([string[]]$Destination, [string]$Skills)
$ErrorActionPreference = 'Stop'

# A test run (-Destination) removes only what it was pointed at: the
# shortcuts' icon (install.ps1 copies it from T3) and the logs and marker in
# %TEMP%\t3-latex belong to the real install and the T3 running from it.
$real = -not $Destination
if ($real) {
  $Destination = @([Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('Desktop'))
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
if (-not $Skills) {
  $claude = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME '.claude' }
  $Skills = Join-Path $claude 'skills'
}
$skill = Join-Path $Skills 't3-visualize'
if (Test-Path $skill) {
  Remove-Item $skill -Recurse -Force
  "removed  $skill"
}
$state = Join-Path $env:TEMP 't3-latex'
if ($real -and (Test-Path $state)) {
  Remove-Item $state -Recurse -Force -ErrorAction SilentlyContinue
  "removed  $state"
}
