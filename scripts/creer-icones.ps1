# Génère les icônes de l'appli (jeu/icones/) : étoile dorée sur fond bleu nuit, en PNG et en .ico.
# Usage : powershell -ExecutionPolicy Bypass -File scripts/creer-icones.ps1
Add-Type -AssemblyName System.Drawing
$dir = Join-Path (Split-Path -Parent $PSScriptRoot) 'jeu\icones'
New-Item -ItemType Directory -Force $dir | Out-Null

function New-Icon([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'; $g.TextRenderingHint = 'AntiAliasGridFit'
  $rect = New-Object System.Drawing.RectangleF 0, 0, $size, $size
  # fond : dégradé radial bleu nuit -> violet
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddEllipse(-$size * 0.25, -$size * 0.25, $size * 1.5, $size * 1.5)
  $bg = New-Object System.Drawing.Drawing2D.PathGradientBrush $path
  $bg.CenterColor = [System.Drawing.Color]::FromArgb(255, 61, 42, 126)
  $bg.SurroundColors = @([System.Drawing.Color]::FromArgb(255, 11, 16, 38))
  $g.FillRectangle($bg, $rect)
  # cercle doré
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 201, 162, 74)), ([Math]::Max(1, $size * 0.035))
  $m = $size * 0.12
  $g.DrawEllipse($pen, $m, $m, $size - 2 * $m, $size - 2 * $m)
  # étoile à quatre branches
  $c = $size / 2; $r = $size * 0.30; $w = $size * 0.075
  $pts = @()
  for ($i = 0; $i -lt 8; $i++) {
    $a = [Math]::PI / 4 * $i - [Math]::PI / 2
    $d = if ($i % 2 -eq 0) { $r } else { $w }
    $pts += New-Object System.Drawing.PointF ($c + $d * [Math]::Cos($a)), ($c + $d * [Math]::Sin($a))
  }
  $gold = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(255, 255, 230, 150)), ([System.Drawing.Color]::FromArgb(255, 184, 134, 43)), 90
  $g.FillPolygon($gold, [System.Drawing.PointF[]]$pts)
  $g.Dispose()
  return $bmp
}

$pngs = @{}
foreach ($s in 32, 180, 192, 256, 512) {
  $bmp = New-Icon $s
  $file = Join-Path $dir "icone-$s.png"
  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  $pngs[$s] = [System.IO.File]::ReadAllBytes($file)
}

# .ico contenant les images 32 et 256 px (format PNG intégré)
$sizes = 32, 256
$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter $ms
$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
foreach ($s in $sizes) {
  $b = if ($s -ge 256) { 0 } else { $s }
  $bw.Write([byte]$b); $bw.Write([byte]$b); $bw.Write([byte]0); $bw.Write([byte]0)
  $bw.Write([UInt16]1); $bw.Write([UInt16]32); $bw.Write([UInt32]$pngs[$s].Length); $bw.Write([UInt32]$offset)
  $offset += $pngs[$s].Length
}
foreach ($s in $sizes) { $bw.Write($pngs[$s]) }
[System.IO.File]::WriteAllBytes((Join-Path $dir 'icone.ico'), $ms.ToArray())
Write-Output "Icones creees dans $dir"
