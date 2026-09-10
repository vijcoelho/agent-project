// Cockpit -- janela nativa que hospeda a interface local.
//
// Existe por um motivo so: uma janela do Edge em modo --app continua sendo o
// Edge, e a barra de tarefas agrupa por processo. Este executavel tem processo
// e identidade proprios, entao fixa sozinho, com o proprio icone.
//
// A renderizacao ainda e o motor do Edge (WebView2), que ja vem no Windows 11.
// Sem Electron: nada de empacotar um Chromium inteiro.

using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

static class Programa
{
    [STAThread]
    static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new Janela());
    }
}

/// Pinta a barra de titulo do Windows 11 na cor do app.
/// Sem isso ela vem branca e briga com o preto da interface.
static class Tema
{
    [DllImport("dwmapi.dll")]
    static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int valor, int tamanho);

    const int MODO_ESCURO = 20;
    const int COR_BORDA = 34;
    const int COR_BARRA = 35;
    const int COR_TEXTO = 36;

    // O DWM quer a cor em BGR, ao contrario do hexadecimal que usamos no CSS.
    static int Bgr(int r, int g, int b) { return r | (g << 8) | (b << 16); }

    public static void Escurecer(IntPtr hwnd)
    {
        int ligado = 1;
        DwmSetWindowAttribute(hwnd, MODO_ESCURO, ref ligado, sizeof(int));

        int preto = Bgr(0, 0, 0);
        DwmSetWindowAttribute(hwnd, COR_BARRA, ref preto, sizeof(int));

        int fio = Bgr(0x16, 0x18, 0x1c);      // --fio do style.css
        DwmSetWindowAttribute(hwnd, COR_BORDA, ref fio, sizeof(int));

        int tinta = Bgr(0xe6, 0xed, 0xf3);    // --ink do style.css
        DwmSetWindowAttribute(hwnd, COR_TEXTO, ref tinta, sizeof(int));
    }
}

class Janela : Form
{
    readonly WebView2 web = new WebView2();
    readonly Label aviso = new Label();
    readonly string raiz;
    readonly int porta;
    string Url { get { return "http://localhost:" + porta + "/"; } }

    public Janela()
    {
        raiz = Path.GetDirectoryName(Path.GetDirectoryName(Application.ExecutablePath));
        porta = LerPorta();

        Text = "Cockpit";
        Width = 1600;
        Height = 1000;
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.Black;
        try
        {
            string ico = Path.Combine(Path.GetDirectoryName(Application.ExecutablePath), "cockpit.ico");
            if (File.Exists(ico)) Icon = new Icon(ico);
        }
        catch { }

        aviso.Dock = DockStyle.Fill;
        aviso.TextAlign = ContentAlignment.MiddleCenter;
        aviso.ForeColor = ColorTranslator.FromHtml("#00b4ff");
        aviso.BackColor = Color.Black;
        aviso.Font = new Font("Segoe UI", 11f);
        aviso.Text = "subindo o cockpit...";
        Controls.Add(aviso);

        web.Dock = DockStyle.Fill;
        web.DefaultBackgroundColor = Color.Black;
        web.Visible = false;
        Controls.Add(web);

        HandleCreated += delegate { Tema.Escurecer(Handle); };
        Load += async delegate { await Subir(); };
    }

    int LerPorta()
    {
        try
        {
            string txt = File.ReadAllText(Path.Combine(raiz, "cockpit.json"));
            int i = txt.IndexOf("\"port\"");
            if (i >= 0)
            {
                int dp = txt.IndexOf(':', i);
                string n = "";
                for (int j = dp + 1; j < txt.Length && n.Length < 6; j++)
                {
                    if (char.IsDigit(txt[j])) n += txt[j];
                    else if (n.Length > 0) break;
                }
                if (n.Length > 0) return int.Parse(n);
            }
        }
        catch { }
        return 3000;
    }

    bool Responde()
    {
        try
        {
            var req = (HttpWebRequest)WebRequest.Create(Url);
            req.Timeout = 1500;
            req.Method = "HEAD";
            using ((HttpWebResponse)req.GetResponse()) return true;
        }
        catch { return false; }
    }

    void Rodar(string arquivo, string args, bool esperar)
    {
        var psi = new ProcessStartInfo(arquivo, args);
        psi.WorkingDirectory = raiz;
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        var p = Process.Start(psi);
        if (esperar && p != null) p.WaitForExit();
    }

    async Task Subir()
    {
        // O servidor sobrevive a fechar a janela: os agentes continuam vivos.
        if (!await Task.Run(new Func<bool>(Responde)))
        {
            aviso.Text = "preparando a interface...";
            string dist = Path.Combine(raiz, "web", "dist", "index.html");
            if (!File.Exists(dist))
            {
                await Task.Run(delegate { Rodar("npm.cmd", "run build", true); });
            }

            aviso.Text = "subindo o servidor...";
            await Task.Run(delegate { Rodar("node", "servidor/index.ts", false); });

            bool subiu = await Task.Run(delegate
            {
                for (int i = 0; i < 60; i++)
                {
                    if (Responde()) return true;
                    Thread.Sleep(400);
                }
                return false;
            });

            if (!subiu)
            {
                aviso.ForeColor = ColorTranslator.FromHtml("#e0a33a");
                aviso.Text = "o servidor nao respondeu em " + Url
                    + "\n\nrode 'npm start' na pasta do projeto para ver o erro";
                return;
            }
        }

        var pasta = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Cockpit");
        var amb = await CoreWebView2Environment.CreateAsync(null, pasta, null);
        await web.EnsureCoreWebView2Async(amb);

        // Ferramenta local: menu de contexto e atalhos de dev ficam ligados.
        web.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;
        web.CoreWebView2.Settings.AreDevToolsEnabled = true;
        web.CoreWebView2.Settings.IsStatusBarEnabled = false;

        // Link externo abre no navegador de verdade, nao dentro do app.
        web.CoreWebView2.NewWindowRequested += delegate (object s, CoreWebView2NewWindowRequestedEventArgs e)
        {
            e.Handled = true;
            try { Process.Start(new ProcessStartInfo(e.Uri) { UseShellExecute = true }); }
            catch { }
        };

        web.CoreWebView2.WebMessageReceived += AoReceberPedido;

        web.CoreWebView2.Navigate(Url);
        web.Visible = true;
        aviso.Visible = false;
    }

    /// A pagina pede a pasta; quem abre o dialogo e a janela do app.
    /// Pelo servidor ele nascia sem dono e ia parar atras de tudo.
    void AoReceberPedido(object s, CoreWebView2WebMessageReceivedEventArgs e)
    {
        string pedido;
        try { pedido = e.TryGetWebMessageAsString(); }
        catch { return; }
        if (pedido != "escolher-pasta") return;

        string escolhido = "";
        using (var d = new FolderBrowserDialog())
        {
            d.Description = "Escolha a pasta do projeto";
            d.ShowNewFolderButton = true;
            // Dono explicito: o dialogo fica modal e sempre na frente.
            if (d.ShowDialog(this) == DialogResult.OK) escolhido = d.SelectedPath;
        }
        Activate();
        web.CoreWebView2.PostWebMessageAsString("pasta:" + escolhido);
    }
}
