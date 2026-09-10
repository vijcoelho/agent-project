# Gera os PNGs do manifesto a partir do mesmo desenho do .ico.
# (Sem acentos de proposito: o PowerShell 5.1 le .ps1 como ANSI.)

$ErrorActionPreference = "Stop"
$destino = Join-Path (Split-Path -Parent $PSScriptRoot) "web\public"
New-Item -ItemType Directory -Force -Path $destino | Out-Null

Add-Type -AssemblyName System.Drawing

foreach ($t in @(192, 512)) {
  $bmp = New-Object System.Drawing.Bitmap($t, $t)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = "AntiAlias"
  $g.Clear([System.Drawing.Color]::FromArgb(255, 0, 0, 0))

  $neon = [System.Drawing.Color]::FromArgb(255, 0, 180, 255)
  $u = $t / 16.0

  $pen = New-Object System.Drawing.Pen($neon, [Math]::Max(1.0, $u * 0.6))
  $g.DrawRectangle($pen, $u, $u, $t - 2 * $u, $t - 2 * $u)

  $br = New-Object System.Drawing.SolidBrush($neon)
  $alturas = @(0.30, 0.62, 0.44)
  for ($i = 0; $i -lt 3; $i++) {
    $x = $u * (4 + $i * 3)
    $h = $t * $alturas[$i]
    $g.FillRectangle($br, [single]$x, [single]($t - $u * 4 - $h), [single]($u * 1.6), [single]$h)
  }

  $g.Dispose()
  $arquivo = Join-Path $destino "cockpit-$t.png"
  $bmp.Save($arquivo, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "gerado: $arquivo"
}
