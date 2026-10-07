# Prints a shortcut's target, arguments and AppUserModelID (test helper).
param([string]$Path)
$install = Get-Content (Join-Path $PSScriptRoot '..\install.ps1') -Raw
$code = [regex]::Match($install, "(?s)Add-Type -TypeDefinition @'\r?\n(.*?)\r?\n'@").Groups[1].Value
Add-Type -TypeDefinition $code
$l = (New-Object -ComObject WScript.Shell).CreateShortcut($Path)
"target: $($l.TargetPath)"
"args:   $($l.Arguments)"
"aumid:  $([T3Latex.Shortcut]::GetAppUserModelId($Path))"
