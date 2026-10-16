# Génère des miniatures JPEG (300 px de large) des visuels dans images/thumbs/, pour un affichage rapide dans le jeu.
# Usage : powershell -ExecutionPolicy Bypass -File scripts/make-thumbs.ps1
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'images'
$dst = Join-Path $src 'thumbs'
$width = 300
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters 1
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 82L
$done = 0
Get-ChildItem $src -Recurse -Filter *.jpg | Where-Object { $_.FullName -notlike "$dst*" } | ForEach-Object {
  $rel = $_.FullName.Substring($src.Length + 1)
  $out = Join-Path $dst $rel
  if (Test-Path $out) { return }
  New-Item -ItemType Directory -Force (Split-Path $out) | Out-Null
  $img = [System.Drawing.Image]::FromFile($_.FullName)
  $h = [int]($img.Height * $width / $img.Width)
  $bmp = New-Object System.Drawing.Bitmap $width, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($img, 0, 0, $width, $h)
  $bmp.Save($out, $codec, $params)
  $g.Dispose(); $bmp.Dispose(); $img.Dispose()
  $done++
  if ($done % 250 -eq 0) { Write-Output "$done miniatures" }
}
Write-Output "Miniatures terminees : $done nouvelles"
