import { useEffect, useState } from "react";
import {
  criarAgenteProvider,
  definirModeloPonte,
  fetchPontes,
  salvarChavePonte,
  sincronizarModelosPonte,
  testarPonte,
  type ModeloPonte,
  type StatusPonte,
  type TestePonte,
} from "./api.ts";

/**
 * IA de graça.
 *
 * O OpenRouter reúne modelos de vários laboratórios e alguns custam zero. Ele
 * não tem CLI: é uma API. O cockpit resolve isso emprestando o binário do
 * Codex e apontando ele para lá — o painel é o de sempre, a conta é que não
 * vem. É o lugar para trabalho volumoso e para o dia em que as assinaturas
 * batem no limite e a missão precisava continuar de algum jeito.
 *
 * A tela é honesta sobre o preço disso: modelo grátis é modelo menor, e nem
 * todo modelo aceita ferramentas — sem ferramentas ele conversa, não trabalha.
 * Por isso existe o botão de testar, que fala com a API de verdade pelo mesmo
 * caminho do painel antes de você abrir um e descobrir no susto.
 */

const contexto = (n: number | null): string => {
  if (!n) return "";
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}M de contexto`;
  return `${Math.round(n / 1000)}k de contexto`;
};

const quando = (t: number | null): string => {
  if (!t) return "nunca";
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  return `há ${Math.round(min / 60)} h`;
};

function Modelos({
  ponte,
  ocupado,
  onEscolher,
}: {
  ponte: StatusPonte;
  ocupado: boolean;
  onEscolher: (m: ModeloPonte) => void;
}) {
  const [tudo, setTudo] = useState(false);
  const usaveis = ponte.modelos.filter((m) => m.ferramentas);
  const resto = ponte.modelos.filter((m) => !m.ferramentas);
  const lista = tudo ? [...usaveis, ...resto] : usaveis;

  if (ponte.modelos.length === 0) return null;

  return (
    <div className="campo-bloco">
      <span className="rotulo">
        Modelos de custo zero <em>— catálogo lido {quando(ponte.catalogoEm)}</em>
      </span>
      <div className="lista-modelos">
        {lista.map((m) => (
          <button
            key={m.id}
            className={`modelo-livre${ponte.modelo === m.id ? " on" : ""}`}
            disabled={ocupado || !m.ferramentas}
            title={
              m.ferramentas
                ? "usar este como padrão do agente GRÁTIS"
                : "este modelo não aceita ferramentas: conversa, mas não edita arquivo"
            }
            onClick={() => onEscolher(m)}
          >
            <b>{m.id}</b>
            <span>
              {contexto(m.contexto)}
              {!m.ferramentas && " · sem ferramentas"}
              {ponte.modelo === m.id && " · em uso"}
            </span>
          </button>
        ))}
      </div>
      {resto.length > 0 && (
        <button className="btn quiet" onClick={() => setTudo(!tudo)}>
          {tudo ? "esconder" : `mostrar os ${resto.length} sem ferramentas`}
        </button>
      )}
    </div>
  );
}

export function Gratis({ onMudou }: { onMudou: () => void }) {
  const [pontes, setPontes] = useState<StatusPonte[]>([]);
  const [digitando, setDigitando] = useState<string | null>(null);
  const [chave, setChave] = useState("");
  const [testes, setTestes] = useState<Record<string, TestePonte>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [recado, setRecado] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const recarregar = () =>
    fetchPontes().then(
      (d) => setPontes(d.pontes),
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
      onMudou();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="wizard-corpo">
      {erro && (
        <div className="aviso">
          {erro}
          <button onClick={() => setErro(null)}>✕</button>
        </div>
      )}
      {recado && (
        <div className="aviso ok">
          {recado}
          <button onClick={() => setRecado(null)}>✕</button>
        </div>
      )}

      <p className="dica">
        Estes provedores não são programas: são APIs. O cockpit roda cada um
        pelo binário de um CLI que você já tem, apontado para outro servidor —
        o painel é o mesmo, o modelo é que muda. Traga sua chave: ela fica
        cifrada em <code>~/.cockpit</code> e só existe dentro do processo do
        painel.
      </p>

      {pontes.length === 0 && <p className="ressalva">Nenhuma ponte configurada no cockpit.json.</p>}

      {pontes.map((p) => (
        <div key={p.id} className="campo-bloco">
          <div className={`prov${p.pronto ? " on" : ""}`}>
            <span className="prov-luz" />
            <div className="prov-corpo">
              <b>{p.label}</b>
              <span className="prov-agentes">
                roda pelo <code>{p.base}</code> · {p.baseUrl}
                {p.modelos.length > 0 && ` · ${p.modelos.length} modelos grátis`}
              </span>
              {p.pronto && p.chaveEm && <span className="prov-cmd">chave vinda de {p.chaveEm}</span>}
              {!p.pronto && <span className="prov-instalar">{p.falta}</span>}
              {p.nota && <span className="prov-cmd">{p.nota}</span>}
              {p.agentes.length > 0 && (
                <span className="prov-agentes">
                  agente: {p.agentes.join(", ")} · modelo em uso {p.modelo ?? "—"}
                </span>
              )}
              {testes[p.id] && (
                <span className={`prov-teste${testes[p.id]!.ok ? " ok" : " falhou"}`}>
                  {testes[p.id]!.modelo}: {testes[p.id]!.detalhe} ({testes[p.id]!.ms} ms)
                </span>
              )}
            </div>

            {digitando === p.id ? (
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
                <button
                  className="btn quiet"
                  onClick={() => {
                    setDigitando(null);
                    setChave("");
                  }}
                >
                  Cancelar
                </button>
                <button
                  className="btn solid"
                  disabled={ocupado || !chave.trim()}
                  onClick={() =>
                    guardado(async () => {
                      await salvarChavePonte(p.id, chave.trim());
                      setChave("");
                      setDigitando(null);
                      // Com a chave posta, o catálogo vivo já pode ser lido.
                      await sincronizarModelosPonte(p.id).catch(() => undefined);
                    })
                  }
                >
                  Guardar
                </button>
              </div>
            ) : (
              <>
                <button className="btn" disabled={ocupado} onClick={() => setDigitando(p.id)}>
                  {p.chaveEm ? "Trocar chave" : "Pôr chave"}
                </button>
                {p.chaveEm === "cofre do cockpit" && (
                  <button
                    className="btn quiet"
                    disabled={ocupado}
                    title="tira a chave do cofre; não cancela nada na sua conta"
                    onClick={() => guardado(() => salvarChavePonte(p.id, "").then(() => undefined))}
                  >
                    Remover
                  </button>
                )}
              </>
            )}
          </div>

          <div className="form-acoes">
            {p.chaveUrl && !p.chaveEm && (
              <a className="btn" href={p.chaveUrl} target="_blank" rel="noreferrer">
                Criar chave
              </a>
            )}
            <button
              className="btn"
              disabled={ocupado}
              title="relê o catálogo do provedor e salva a lista viva"
              onClick={() =>
                guardado(async () => {
                  const r = await sincronizarModelosPonte(p.id);
                  setRecado(`${r.modelos.filter((m) => m.ferramentas).length} modelos grátis com ferramentas.`);
                })
              }
            >
              Atualizar modelos
            </button>
            <button
              className="btn"
              disabled={ocupado || !p.chaveEm}
              title="fala com a API pelo mesmo caminho que o painel usa"
              onClick={() =>
                guardado(async () => {
                  const r = await testarPonte(p.id);
                  setTestes((t) => ({ ...t, [p.id]: r }));
                })
              }
            >
              {ocupado ? "testando…" : "Testar de verdade"}
            </button>
            {p.pronto && p.agentes.length === 0 && (
              <button
                className="btn solid"
                disabled={ocupado}
                title="sem agente o provedor não aparece em nenhuma missão"
                onClick={() => guardado(() => criarAgenteProvider(p.id).then(() => undefined))}
              >
                Criar agente
              </button>
            )}
          </div>

          <Modelos
            ponte={p}
            ocupado={ocupado}
            onEscolher={(m) => guardado(() => definirModeloPonte(p.id, m.id).then(() => undefined))}
          />
        </div>
      ))}

      <p className="ressalva">
        Modelo grátis é modelo menor. Ele serve para volume, rascunho e busca em
        código; arquitetura e bug difícil continuam valendo a assinatura. O
        cockpit também usa a ponte como colete: quando todas as cotas pagas
        estouram no meio de uma missão, o maestro migra para cá em vez de parar.
      </p>
    </div>
  );
}
