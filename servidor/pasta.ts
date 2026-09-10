import { execFile } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Abre o seletor de pastas do Windows.
 *
 * O navegador não sabe o caminho real de uma pasta — o showDirectoryPicker dá
 * um handle, não um caminho, e o servidor precisa de caminho para criar
 * worktree e observar arquivos. Como o servidor roda na mesma máquina que a
 * tela, ele mesmo abre o diálogo nativo.
 *
 * O diálogo precisa de um dono visível e em primeiro plano, senão o Windows o
 * coloca atrás da janela ativa e o clique parece não ter feito nada. A
 * janela-dona é de 1px, fora da tela, só para servir de âncora.
 *
 * O script vai em arquivo, não em -Command: passar código com aspas e
 * here-string como argumento faz o Node escapar as aspas e o PowerShell perder
 * o bloco.
 */
const SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$fonte = @'
using System;
using System.Runtime.InteropServices;
public class Frente {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
}
'@
Add-Type -TypeDefinition $fonte

$topo = New-Object System.Windows.Forms.Form
$topo.TopMost = $true
$topo.ShowInTaskbar = $false
$topo.FormBorderStyle = "None"
$topo.Size = New-Object System.Drawing.Size(1, 1)
$topo.StartPosition = "Manual"
$topo.Location = New-Object System.Drawing.Point(-2000, -2000)
$topo.Show()
$topo.Activate()
[void][Frente]::BringWindowToTop($topo.Handle)
[void][Frente]::SetForegroundWindow($topo.Handle)

$d = New-Object System.Windows.Forms.FolderBrowserDialog
$d.Description = "Escolha a pasta do projeto"
$d.ShowNewFolderButton = $true
if ($d.ShowDialog($topo) -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::Out.Write($d.SelectedPath)
}
$topo.Close()
$topo.Dispose()
`;

let caminhoScript: string | null = null;

function scriptEmDisco(): string {
  if (!caminhoScript) {
    caminhoScript = join(mkdtempSync(join(tmpdir(), "cockpit-")), "pasta.ps1");
    writeFileSync(caminhoScript, SCRIPT, "utf8");
  }
  return caminhoScript;
}

export function escolherPasta(): Promise<string | null> {
  if (process.platform !== "win32") {
    return Promise.reject(new Error("o seletor de pastas só existe no Windows"));
  }
  return new Promise((resolve, reject) => {
    execFile(
      "powershell",
      ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", scriptEmDisco()],
      // Sem pressa: o diálogo fica aberto até você escolher.
      { timeout: 10 * 60_000, windowsHide: true },
      (err, stdout, stderr) => {
        const caminho = stdout.trim();
        if (caminho) return resolve(caminho);
        // Fechar o diálogo pelo X faz o PowerShell sair com código não-zero
        // sem escrever nada: isso é cancelamento, não falha.
        if (err && stderr.trim()) {
          reject(new Error(`o seletor de pastas falhou: ${stderr.trim().split("\n")[0]}`));
        } else {
          resolve(null);
        }
      },
    );
  });
}
