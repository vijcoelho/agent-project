import { useEffect, useMemo, useState } from "react";
import {
  adicionarFonte,
  baixarPlugin,
  fetchMarketplace,
  instalarDoMarketplace,
  type Fonte,
  type PluginAchado,
} from "./api.ts";

/**
 * O marketplace.
 *
 * As fontes são repositórios git no formato de marketplace do Claude Code —
 * inclusive o oficial, que você já tem configurado. Nada aqui é catálogo
 * inventado: o que aparece é o que o manifesto lista.
 *
 * Quase todo plugin mora em outro repositório e só é baixado quando você
 * manda. Por isso um plugin aparece de dois jeitos: com as skills à mostra
 * (já está em disco) ou fechado, com um botão para trazer.
 */

export function Marketplace({ onMudou }: { onMudou: () => void }) {
  const [plugins, setPlugins] = useState<PluginAchado[]>([]);
  const [fontes, setFontes] = useState<Fonte[]>([]);
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [so, setSo] = useState<"tudo" | "skills" | "mcp">("tudo");
  const [erro, setErro] = useState<string | null>(null);
  const [recado, setRecado] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [novaFonte, setNovaFonte] = useState<string | null>(null);

  const recarregar = () =>
    fetchMarketplace().then(
      (d) => {
        setPlugins(d.plugins ?? []);
        setFontes(d.fontes ?? []);
      },
      (e: Error) => setErro(e.message),
    );

  useEffect(() => {
    void recarregar();
  }, []);

  const guardado = async (chave: string, fn: () => Promise<void>) => {
    setOcupado(chave);
    setErro(null);
    try {
      await fn();
      await recarregar();
      onMudou();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  };

  const categorias = useMemo(
    () => [...new Set(plugins.map((p) => p.categoria).filter((c): c is string => !!c))].sort(),
    [plugins],
  );

  const alvo = busca.trim().toLowerCase();
  const achados = plugins.filter((p) => {
    if (categoria && p.categoria !== categoria) return false;
    if (so === "skills" && p.skills.length === 0) return false;
    if (so === "mcp" && p.mcps.length === 0) return false;
    if (!alvo) return true;
    const texto = `${p.id} ${p.descricao} ${p.skills.map((s) => `${s.nome} ${s.descricao}`).join(" ")}`;
    return texto.toLowerCase().includes(alvo);
  });

  return (
    <div className="wizard-corpo">
      {erro && <div className="aviso">{erro}<button onClick={() => setErro(null)}>✕</button></div>}
      {recado && <div className="aviso ok">{recado}<button onClick={() => setRecado(null)}>✕</button></div>}

      <div className="barra-acervo">
        <input
          className="campo"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar plugin ou skill…"
          aria-label="Buscar no marketplace"
        />
        <select className="picker" value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoria">
          <option value="">todas as categorias</option>
          {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="cols" role="group" aria-label="Filtrar por conteúdo">
          {(["tudo", "skills", "mcp"] as const).map((f) => (
            <button key={f} className={so === f ? "on" : undefined} onClick={() => setSo(f)}>{f}</button>
          ))}
        </span>
      </div>

      <p className="dica">
        <b>{achados.length}</b> de {plugins.length} plugins, de {fontes.length} fonte(s):{" "}
        {fontes.map((f) => f.id).join(", ")}. Um plugin fechado ainda não está em disco — baixar traz
        o repositório dele e mostra o que tem dentro.
      </p>

      <div className="lista-skills">
        {achados.slice(0, 120).map((p) => (
          <div key={p.id} className={`plugin${p.local ? " baixado" : ""}`}>
            <div className="plugin-topo">
              <b>{p.nome}</b>
              {p.categoria && <span className="tipo-chip">{p.categoria}</span>}
              {p.mcps.length > 0 && (
                <span className="tipo-chip mcp" title={`servidores MCP: ${p.mcps.join(", ")}`}>
                  {p.mcps.length} MCP
                </span>
              )}
              <span className="spacer" />
              {!p.local ? (
                <button
                  className="btn"
                  disabled={ocupado !== null}
                  title={p.remoto ? `baixa de ${p.remoto.url}` : ""}
                  onClick={() =>
                    guardado(p.id, async () => {
                      const trazido = await baixarPlugin(p.id);
                      setRecado(
                        trazido.skills.length > 0
                          ? `${trazido.nome}: ${trazido.skills.length} skill(s) para instalar.`
                          : `${trazido.nome} veio sem skill${trazido.mcps.length ? ` — só MCP (${trazido.mcps.join(", ")})` : ""}.`,
                      );
                    })
                  }
                >
                  {ocupado === p.id ? "baixando…" : "Baixar"}
                </button>
              ) : (
                p.skills.some((s) => !s.instalada) && (
                  <button
                    className="btn solid"
                    disabled={ocupado !== null}
                    onClick={() =>
                      guardado(p.id, async () => {
                        const r = await instalarDoMarketplace(p.id);
                        setRecado(`instaladas: ${(r.instaladas ?? []).join(", ") || "nenhuma"}`);
                      })
                    }
                  >
                    Instalar tudo
                  </button>
                )
              )}
            </div>
            <p className="plugin-desc">{p.descricao}</p>
            {p.skills.length > 0 && (
              <div className="plugin-skills">
                {p.skills.map((s) => (
                  <button
                    key={s.nome}
                    className={`chip-skill${s.instalada ? " on" : ""}`}
                    disabled={s.instalada || ocupado !== null}
                    title={s.instalada ? "já está no acervo" : s.descricao}
                    onClick={() =>
                      guardado(`${p.id}:${s.nome}`, async () => {
                        await instalarDoMarketplace(p.id, s.nome);
                        setRecado(`"${s.nome}" entrou no acervo.`);
                      })
                    }
                  >
                    {s.instalada ? "✓ " : "+ "}
                    {s.nome}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {achados.length > 120 && (
          <p className="vazio-nota">…e mais {achados.length - 120}. Refine a busca.</p>
        )}
        {achados.length === 0 && <p className="vazio-nota">Nada com esse filtro.</p>}
      </div>

      <div className="campo-bloco">
        <span className="rotulo">Outra fonte <em>— repositório git com `.claude-plugin/marketplace.json`</em></span>
        {novaFonte === null ? (
          <div><button className="btn" onClick={() => setNovaFonte("")}>Conectar marketplace</button></div>
        ) : (
          <div className="form-inline">
            <input
              className="campo"
              autoFocus
              value={novaFonte}
              onChange={(e) => setNovaFonte(e.target.value)}
              placeholder="https://github.com/alguem/marketplace.git"
            />
            <div className="form-acoes">
              <button className="btn quiet" onClick={() => setNovaFonte(null)}>Cancelar</button>
              <button
                className="btn solid"
                disabled={ocupado !== null || !novaFonte.trim()}
                onClick={() =>
                  guardado("fonte", async () => {
                    const f = await adicionarFonte(novaFonte);
                    setRecado(`${f.id}: ${f.plugins} plugin(s).`);
                    setNovaFonte(null);
                  })
                }
              >
                Conectar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
