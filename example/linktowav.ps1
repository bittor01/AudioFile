# Save as UpdateShortcuts.ps1 (UTF-8 or ANSI both work)
Param(
  [string]$Path = (Get-Location).Path
)

$Wsh = New-Object -ComObject WScript.Shell
Get-ChildItem -Path $Path -Filter '*.lnk' | ForEach-Object {
  $sc = $Wsh.CreateShortcut($_.FullName)
  if ($sc.TargetPath -match '\.mp3$') {
    $wav = $sc.TargetPath -replace '\.mp3$','.wav'
    if (Test-Path $wav) {
      $sc.TargetPath = $wav
      $sc.Save()
      $newName = $_.Name -replace '\.mp3 - Shortcut\.lnk$', '.wav - Shortcut.lnk'
      Rename-Item -LiteralPath $_.FullName -NewName $newName
      Write-Host "Updated $($_.Name) → $newName"
    } else {
      Write-Warning "Missing WAV: $wav"
    }
  }
}