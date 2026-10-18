# One-time setup: create a Desktop shortcut for XBloom Studio.
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ico = Join-Path $dir "xbloom-app\public\icon.ico"
$desktop = [Environment]::GetFolderPath("Desktop")
$lnk = Join-Path $desktop "XBloom Studio.lnk"
$ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut($lnk)
$s.TargetPath = Join-Path $dir "XBloom.cmd"
$s.WorkingDirectory = $dir
$s.IconLocation = $ico
$s.Description = "XBloom Studio"
$s.Save()
Write-Host "OK - shortcut created on the Desktop"
