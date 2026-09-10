import { useEffect, useState } from "react";
import {
  definirModeloMedia,
  fetchMedia,
  instalarProvedorMedia,
  salvarChaveMedia,
  type MediaProvider,
} from "./api.ts";

/**
 * Provedores de imagem, vídeo e áudio.
 *
 * A tela nunca esconde um provedor que não está pronto: some da lista é como
 * você deixa de saber que ele existe. Cada um mostra o que falta e o passo
 * exato para ligar.
 *
 * A chave entra e não sai. Nenhuma rota devolve o valor — só se está posta e
 * de onde veio. Fica cifrada em ~/.cockpit/chaves.json, o que protege contra
 * leitura casual do arquivo; quem já está logado como você lê assim mesmo.
 */

const ROTULO: Record<string, string> = { image: "imagem", video: "vídeo", audio: "áudio" };

export function Media() {
  const [provedores, setProvedores] = useState<MediaProvider[]>([]);
  const [digitando, setDigitando] = useState<string | null>(null);
  const [chave, setChave] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [recado, setRecado] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const recarregar = (rescan = false) =>
    fetchMedia(rescan).then(
      (d) => setProvedores(d.provedores ?? []),
      (e: Error) => setErro(e.message),
    );

  useEffect(() => {
    void recarregar();
  }, []);

  const guardado = async (fn: () => Promise<void>) => {
    setOcupado(true);
    setErro(null);
    try {
      await fn();
      await recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  };

  const prontos = provedores.filter((p) => p.pronto);
  const faz = (tipo: string) => prontos.filter((p) => p.faz.includes(tipo)).length;

  return (
    <div className="wizard-corpo">
      {erro && <div className="aviso">{erro}<button onClick={() => setErro(null)}>✕</button></div>}
      {recado && <div className="aviso ok">{recado}<button onClick={() => setRecado(null)}>✕</button></div>}

      <div className="barra-acervo">
        <span className="resumo-media">
          {(["image", "video", "audio"] as const).map((t) => (
            <span key={t} className={faz(t) > 0 ? "on" : undefined}>
              {ROTULO[t]} <b>{faz(t)}</b>
            </span>
          ))}
        </span>
        <span className="spacer" />
        <button className="btn" disabled={ocupado} onClick={() => guardado(() => recarregar(true))}>
          Procurar de novo
        </button>
      </div>

      <p className="dica">
        Os agentes <b>PINTOR</b> e <b>CINEASTA</b> usam isto pelas ferramentas do cockpit e sempre
        preferem o provedor de assinatura. Sem provedor pronto eles avisam em vez de tentar —
        nenhum deles inventa um arquivo.
      </p>
      <p className="ressalva">
        <b>agy e codex não geram imagem nem vídeo.</b> São agentes de código: o <code>agy models</code>{" "}
        só lista modelos de texto e o <code>codex</code> não tem subcomando de media. Suas
        assinaturas Google Pro e Plus pagam o raciocínio deles, não a geração — por isso a
        assinatura que serve aqui é a do Higgsfield.
      </p>

      <div className="lista-prov">
        {provedores.map((p) => (
          <div key={p.id} className={`prov${p.pronto ? " on" : ""}`}>
            <span className="prov-luz" />
            <div className="prov-corpo">
              <b>{p.label}</b>
              <span className="prov-agentes">
                {p.faz.map((f) => ROTULO[f] ?? f).join(", ")}
                {" · "}
                <b className={p.pagamento === "assinatura" ? "pago-assinatura" : "pago-chave"}>
                  {p.pagamento === "assinatura" ? "assinatura, sem chave" : "cobra por uso"}
                </b>
              </span>
              {p.pronto && p.chaveEm && (
                <span className="prov-cmd">chave vinda de {p.chaveEm}</span>
              )}
              {!p.pronto && (
                <span className="prov-instalar">
                  {p.falta}
                  {p.instalar && <> — <code>{p.instalar}</code></>}
                </span>
              )}
              {p.nota && <span className="prov-cmd">{p.nota}</span>}
              {p.modelos.length > 0 && (
                <label className="linha-modelo">
                  modelo
                  <select
                    className="picker"
                    value={p.modelo ?? ""}
                    disabled={ocupado}
                    onChange={(e) => guardado(() => definirModeloMedia(p.id, e.target.value).then(() => undefined))}
                  >
                    {p.modelos.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
              )}
            </div>

            {p.via === "cli" && !p.pronto && p.instalavel && (
              <button
                className="btn solid"
                disabled={ocupado}
                title={`roda ${p.instalar} por você`}
                onClick={() =>
                  guardado(async () => {
                    const r = await instalarProvedorMedia(p.id);
                    setRecado(`${p.label} instalado. ${r.saida.slice(-160)}`);
                  })
                }
              >
                {ocupado ? "instalando…" : "Instalar"}
              </button>
            )}

            {p.via === "http" && (
              digitando === p.id ? (
                <div className="form-inline chave">
                  <input
                    className="campo"
                    type="password"
                    autoFocus
                    value={chave}
                    onChange={(e) => setChave(e.target.value)}
                    placeholder="cole a chave aqui"
                    aria-label={`Chave de ${p.label}`}
                  />
                  <button className="btn quiet" onClick={() => { setDigitando(null); setChave(""); }}>
                    Cancelar
                  </button>
                  <button
                    className="btn solid"
                    disabled={ocupado || !chave.trim()}
                    onClick={() =>
                      guardado(async () => {
                        await salvarChaveMedia(p.id, chave.trim());
                        setChave("");
                        setDigitando(null);
                      })
                    }
                  >
                    Guardar
                  </button>
                </div>
              ) : (
                <>
                  <button className="btn" disabled={ocupado} onClick={() => setDigitando(p.id)}>
                    {p.pronto ? "Trocar chave" : "Pôr chave"}
                  </button>
                  {p.pronto && p.chaveEm === "cofre do cockpit" && (
                    <button
                      className="btn quiet"
                      disabled={ocupado}
                      title="tira a chave do cofre; não cancela nada na sua conta"
                      onClick={() => guardado(() => salvarChaveMedia(p.id, "").then(() => undefined))}
                    >
                      Remover
                    </button>
                  )}
                </>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
