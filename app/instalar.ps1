# Cria o icone, o lancador e o atalho. Rode uma vez:
#   powershell -ExecutionPolicy Bypass -File app\instalar.ps1
# (Sem acentos de proposito: o PowerShell 5.1 le .ps1 como ANSI.)

$ErrorActionPreference = "Stop"
$app = $PSScriptRoot
$raiz = Split-Path -Parent $app

# ---- icone: quadrado preto com as barras neon do cockpit ----
Add-Type -AssemblyName System.Drawing
$tamanhos = @(256, 128, 64, 48, 32, 16)
$pngs = @()

foreach ($t in $tamanhos) {
  $bmp = New-Object System.Drawing.Bitmap($t, $t)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = "AntiAlias"
  $g.Clear([System.Drawing.Color]::FromArgb(255, 0, 0, 0))

  $neon = [System.Drawing.Color]::FromArgb(255, 0, 180, 255)
  $u = $t / 16.0

  $pen = New-Object System.Drawing.Pen($neon, [Math]::Max(1.0, $u * 0.6))
  $g.DrawRectangle($pen, $u, $u, $t - 2 * $u, $t - 2 * $u)

  # tres barras de atividade, como o sparkline dos paineis
  $br = New-Object System.Drawing.SolidBrush($neon)
  $alturas = @(0.30, 0.62, 0.44)
  for ($i = 0; $i -lt 3; $i++) {
    $larg = $u * 1.6
    $x = $u * (4 + $i * 3)
    $h = $t * $alturas[$i]
    $g.FillRectangle($br, [single]$x, [single]($t - $u * 4 - $h), [single]$larg, [single]$h)
  }

  $g.Dispose()
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $pngs += , $ms.ToArray()
  $bmp.Dispose()
}

# ---- monta o .ico: cabecalho + diretorio + os PNGs ----
$ico = Join-Path $app "cockpit.ico"
$fs = [System.IO.File]::Create($ico)
$bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$tamanhos.Count)

$deslocamento = 6 + 16 * $tamanhos.Count
for ($i = 0; $i -lt $tamanhos.Count; $i++) {
  $t = $tamanhos[$i]
  $lado = if ($t -ge 256) { 0 } else { $t }
  $bw.Write([Byte]$lado); $bw.Write([Byte]$lado)
  $bw.Write([Byte]0); $bw.Write([Byte]0)
  $bw.Write([UInt16]1); $bw.Write([UInt16]32)
  $bw.Write([UInt32]$pngs[$i].Length)
  $bw.Write([UInt32]$deslocamento)
  $deslocamento += $pngs[$i].Length
}
foreach ($p in $pngs) { $bw.Write($p) }
$bw.Close(); $fs.Close()
Write-Host "icone criado: $ico"

# ---- o executavel ----
$exe = Join-Path $app "Cockpit.exe"
if (-not (Test-Path $exe)) {
  Write-Host "compilando o Cockpit.exe..."
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $app "compilar.ps1")
}
Write-Host "executavel: $exe"

# ---- atalho no Menu Iniciar: e dali que se fixa na barra ----
$menu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Cockpit.lnk"
$s = (New-Object -ComObject WScript.Shell).CreateShortcut($menu)
$s.TargetPath = $exe
$s.WorkingDirectory = $app
$s.IconLocation = "$exe,0"
$s.Description = "Cockpit - orquestrador de agentes"
$s.Save()

$desktop = Join-Path ([Environment]::GetFolderPath("Desktop")) "Cockpit.lnk"
Copy-Item $menu $desktop -Force
Write-Host "atalho criado no Menu Iniciar e na Area de Trabalho"
Write-Host ""
Write-Host "Para fixar na barra de tarefas: abra o Menu Iniciar, procure Cockpit,"
Write-Host "clique com o botao direito e escolha 'Fixar na barra de tarefas'."
