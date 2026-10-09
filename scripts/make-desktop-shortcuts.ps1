# Creates two desktop shortcuts for the Video Studio. Run once:
#   powershell -ExecutionPolicy Bypass -File scripts\make-desktop-shortcuts.ps1
$root = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell
foreach ($n in @('Start Video Studio', 'Start Video Studio (phone access)')) {
  $lnk = $shell.CreateShortcut((Join-Path $desktop "$n.lnk"))
  $lnk.TargetPath = Join-Path $root "$n.bat"
  $lnk.WorkingDirectory = $root
  $lnk.WindowStyle = 7
  $lnk.IconLocation = "$env:SystemRoot\System32\shell32.dll,115"
  $lnk.Save()
  Write-Host "Created: $n on Desktop"
}
