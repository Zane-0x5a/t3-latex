# Prints a shortcut's target, arguments and AppUserModelID (test helper).
param([string]$Path)
Add-Type -Path (Join-Path $PSScriptRoot '..\mod\shortcut.cs')
$l = (New-Object -ComObject WScript.Shell).CreateShortcut($Path)
"target: $($l.TargetPath)"
"args:   $($l.Arguments)"
"aumid:  $([T3Latex.Shortcut]::GetAppUserModelId($Path))"
