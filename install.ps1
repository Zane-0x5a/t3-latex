<#
Adds the "T3 Code (LaTeX)" shortcut to the Start menu and the desktop. It
starts T3 Code with formula rendering through launcher\t3-latex.cmd. Nothing
in T3's own folder is touched; uninstall.ps1 removes the shortcuts again.

Also copies the t3-visualize skill into Claude Code's skills folder
(%USERPROFILE%\.claude\skills, or CLAUDE_CONFIG_DIR\skills): it tells Claude,
when it runs in T3, how to write an interactive visualization.

  powershell -ExecutionPolicy Bypass -File install.ps1
  powershell -ExecutionPolicy Bypass -File install.ps1 -Destination <folder> -Skills <folder>   (tests)
#>
param([string[]]$Destination, [string]$Skills)
$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$cmd = Join-Path $root 'launcher\t3-latex.cmd'
# find-t3.cmd prints UTF-8 (any path, whatever the console's code page).
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$t3 = & (Join-Path $root 'launcher\find-t3.cmd') | Select-Object -First 1
$conhost = Join-Path $env:SystemRoot 'System32\conhost.exe'
if (-not $t3 -or -not (Test-Path $t3)) { throw 'T3 Code not found. Install it first, or set T3LATEX_T3_EXE to its exe.' }
if (-not (Test-Path (Join-Path $root 'mod\assets\boot.js'))) { throw 'mod\assets is missing; run: node build.mjs' }
if (-not $Destination) {
  $Destination = @([Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('Desktop'))
}

# The shortcut has its own AppUserModelID, and the launcher gives T3 the same
# one (APP_ID in launcher\launch.cjs), so a pinned "T3 Code (LaTeX)" and the
# T3 window it opens share one taskbar button. It must not be T3's own
# com.t3tools.t3code: the Start menu lists one shortcut per ID and would hide
# this one behind "T3 Code (Alpha)".
$appId = 'com.t3tools.t3code.latex'
Add-Type -Path (Join-Path $root 'mod\shortcut.cs')

# The shortcut's icon is a copy of T3's: pointing at T3's exe would break
# when an update renames it (switching to Nightly does).
$icon = Join-Path $root 'launcher\t3.ico'
try {
  [T3Latex.IconFile]::Save($t3, $icon)
  $iconLocation = "$icon,0"
} catch {
  Write-Warning "could not copy T3's icon, using its exe: $_"
  $iconLocation = "$t3,0"
}

$shell = New-Object -ComObject WScript.Shell
foreach ($dir in $Destination) {
  # Absolute: the shortcut and property-store calls resolve against other folders.
  $path = Join-Path (Resolve-Path -LiteralPath $dir).ProviderPath 'T3 Code (LaTeX).lnk'
  $lnk = $shell.CreateShortcut($path)
  $lnk.TargetPath = $conhost
  $lnk.Arguments = "--headless cmd.exe /d /c `"$cmd`""
  $lnk.WorkingDirectory = Join-Path $root 'launcher'
  $lnk.IconLocation = $iconLocation
  $lnk.Description = 'T3 Code with LaTeX formula rendering (t3-latex)'
  $lnk.Save()
  [T3Latex.Shortcut]::SetAppUserModelId($path, $appId)
  "created  $path"
}
# The skill, replaced whole so files an older version had do not linger.
if (-not $Skills) {
  $claude = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME '.claude' }
  $Skills = Join-Path $claude 'skills'
}
$skill = Join-Path $Skills 't3-visualize'
if (Test-Path $skill) { Remove-Item $skill -Recurse -Force }
New-Item -ItemType Directory -Force $skill | Out-Null
Copy-Item (Join-Path $root 'skill\t3-visualize\*') $skill -Recurse
"copied   $skill"

''
'Done. Quit T3 Code completely (including its tray icon), then open it from "T3 Code (LaTeX)".'
