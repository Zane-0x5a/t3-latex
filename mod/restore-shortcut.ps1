<#
Puts T3's own Start menu shortcut back to T3's own AppUserModelID after
Electron gave it ours (see "T3's own Start menu shortcut" in loader.cjs, which
runs this). Prints the Start menu's Programs folder, which the loader watches,
then "restored <shortcut>" if it changed one.

  restore-shortcut.ps1 -Name <T3's app name> -Exe <T3's exe> -From <our id> -To <T3's id>
  restore-shortcut.ps1 ... -Dir <folder>   (tests: a folder instead of the Start menu)
#>
param([string]$Name, [string]$Exe, [string]$From, [string]$To, [string]$Dir)
$ErrorActionPreference = 'Stop'
# The loader reads this as UTF-8 (a user folder can be outside the code page).
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}

if (-not $Dir) { $Dir = [Environment]::GetFolderPath('Programs') }
$Dir
$path = Join-Path $Dir "$Name.lnk"
if (-not (Test-Path -LiteralPath $path)) { return }
# Cheap test first, so the C# is compiled only when needed: does the file hold
# our ID as a shortcut stores it (UTF-16, null-terminated)? Compared as hex
# ("1F-00-..."), which only matches whole bytes, at any offset.
$hex = [BitConverter]::ToString([IO.File]::ReadAllBytes($path))
if (-not $hex.Contains([BitConverter]::ToString([Text.Encoding]::Unicode.GetBytes("$From`0")))) { return }
# Electron's shortcut: T3's exe itself.
if ((New-Object -ComObject WScript.Shell).CreateShortcut($path).TargetPath -ne $Exe) { return }
Add-Type -Path (Join-Path $PSScriptRoot 'shortcut.cs')
if ([T3Latex.Shortcut]::GetAppUserModelId($path) -ne $From) { return }
[T3Latex.Shortcut]::SetAppUserModelId($path, $To)
"restored $path"
