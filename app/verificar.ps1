# Diz se o Cockpit.exe ja consegue rodar nesta maquina.
# Rode depois de mexer no Smart App Control:
#   powershell -ExecutionPolicy Bypass -File app\verificar.ps1
# (Sem acentos de proposito: o PowerShell 5.1 le .ps1 como ANSI.)

$exe = Join-Path $PSScriptRoot "Cockpit.exe"

$ci = Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy" -ErrorAction SilentlyContinue
$estado = $ci.VerifiedAndReputablePolicyState
$nome = switch ($estado) { 0 { "desligado" } 1 { "LIGADO (bloqueia)" } 2 { "em avaliacao" } default { "desconhecido" } }
Write-Host "Smart App Control: $nome"

if (-not (Test-Path $exe)) {
  Write-Host "Cockpit.exe nao existe -- rode app\compilar.ps1"
  exit 1
}

try {
  $p = Start-Process $exe -PassThru -ErrorAction Stop
  Start-Sleep -Seconds 3
  if (-not $p.HasExited) {
    Write-Host "FUNCIONA: o app abriu (pid $($p.Id))"
    Write-Host "Fixe pelo Menu Iniciar: procure Cockpit, botao direito, Fixar na barra de tarefas."
  } else {
    Write-Host "o app abriu e fechou sozinho -- veja o log do servidor"
  }
} catch {
  Write-Host "AINDA BLOQUEADO: $($_.Exception.Message)"
  Write-Host ""
  Write-Host "Desligue em: Seguranca do Windows > Controle de aplicativos e navegador"
  Write-Host "             > Smart App Control > Desativado"
}
