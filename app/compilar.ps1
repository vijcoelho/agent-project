# Compila o Cockpit.exe. Usa o csc do .NET Framework que ja vem no Windows --
# nada de instalar SDK. Rode:  powershell -ExecutionPolicy Bypass -File app\compilar.ps1
# (Sem acentos de proposito: o PowerShell 5.1 le .ps1 como ANSI.)

$ErrorActionPreference = "Stop"
$app = $PSScriptRoot
$pkg = Join-Path $app "sdk\pkg"

$csc = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) { throw "csc.exe nao encontrado; o .NET Framework 4 nao esta instalado" }

# As DLLs gerenciadas ficam ao lado do exe; a nativa e carregada em runtime.
# Elas ja vao versionadas em app\, entao o SDK completo so e preciso para
# trocar de versao -- se a pasta sdk existir, ela tem prioridade.
$core = Join-Path $pkg "lib\net462\Microsoft.Web.WebView2.Core.dll"
$wf = Join-Path $pkg "lib\net462\Microsoft.Web.WebView2.WinForms.dll"
$loader = Join-Path $pkg "runtimes\win-x64\native\WebView2Loader.dll"
if ((Test-Path $core) -and (Test-Path $wf) -and (Test-Path $loader)) {
  Copy-Item $core, $wf, $loader $app -Force
}

foreach ($n in @("Microsoft.Web.WebView2.Core.dll", "Microsoft.Web.WebView2.WinForms.dll", "WebView2Loader.dll")) {
  if (-not (Test-Path (Join-Path $app $n))) {
    throw "faltando $n em app\. Baixe o pacote Microsoft.Web.WebView2 do NuGet e extraia em app\sdk\pkg"
  }
}

if (-not (Test-Path (Join-Path $app "cockpit.ico"))) {
  throw "cockpit.ico nao existe; rode app\instalar.ps1 antes para gerar o icone"
}

$saida = Join-Path $app "Cockpit.exe"
$argumentos = @(
  "/target:winexe",
  "/platform:x64",
  "/nologo",
  "/optimize+",
  "/out:`"$saida`"",
  "/win32icon:`"$(Join-Path $app 'cockpit.ico')`"",
  "/reference:System.dll",
  "/reference:System.Core.dll",
  "/reference:System.Drawing.dll",
  "/reference:System.Windows.Forms.dll",
  "/reference:`"$(Join-Path $app 'Microsoft.Web.WebView2.Core.dll')`"",
  "/reference:`"$(Join-Path $app 'Microsoft.Web.WebView2.WinForms.dll')`"",
  "`"$(Join-Path $app 'Cockpit.cs')`""
)

& $csc @argumentos
if ($LASTEXITCODE -ne 0) { throw "a compilacao falhou" }

$tam = [Math]::Round((Get-Item $saida).Length / 1KB)
Write-Host "Cockpit.exe compilado ($tam KB)"
