# Save as UpdateShortcuts.ps1 (UTF-8 or ANSI both work)
Param(
  [string]$Path = (Get-Location).Path,
  [string]$TargetExt = ".mp3"
)

if (-not $TargetExt.StartsWith(".")) {
  $TargetExt = "." + $TargetExt
}

$Wsh = New-Object -ComObject WScript.Shell
Get-ChildItem -Path $Path -Recurse -Filter '*.lnk' | ForEach-Object {
  $sc = $Wsh.CreateShortcut($_.FullName)
  $currentTarget = $sc.TargetPath
  if ($currentTarget) {
    $dir = [System.IO.Path]::GetDirectoryName($currentTarget)
    $nameWithoutExt = [System.IO.Path]::GetFileNameWithoutExtension($currentTarget)
    $ext = [System.IO.Path]::GetExtension($currentTarget)

    if ($ext -and ($ext.ToLower() -ne $TargetExt.ToLower())) {
      $newTargetPath = [System.IO.Path]::Combine($dir, $nameWithoutExt + $TargetExt)
      if (Test-Path -LiteralPath $newTargetPath) {
        $sc.TargetPath = $newTargetPath
        $sc.Save()

        # Update shortcut file name if it matches standard patterns e.g. "song.wav - Shortcut.lnk"
        $scDir = $_.DirectoryName
        $scName = $_.Name
        $newScName = $scName -replace "($([regex]::Escape($ext)))\b", $TargetExt
        if ($newScName -ne $scName) {
          $newScPath = [System.IO.Path]::Combine($scDir, $newScName)
          if (-not (Test-Path -LiteralPath $newScPath)) {
            Rename-Item -LiteralPath $_.FullName -NewName $newScName
          }
        }
        Write-Host "Updated $($_.Name) target -> $newTargetPath"
      }
    }
  }
}