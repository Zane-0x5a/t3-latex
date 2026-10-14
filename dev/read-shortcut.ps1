# Prints a shortcut's target, arguments and AppUserModelID (test helper).
param([string]$Path)
# The test reads this as UTF-8 (its folders are outside ASCII).
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
Add-Type -Path (Join-Path $PSScriptRoot '..\mod\shortcut.cs')
"target: $([T3Latex.Shortcut]::GetTarget($Path))"
"args:   $([T3Latex.Shortcut]::GetArguments($Path))"
"aumid:  $([T3Latex.Shortcut]::GetAppUserModelId($Path))"
