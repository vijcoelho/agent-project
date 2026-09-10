import { useEffect, useState } from "react";
import {
  conectarProvider,
  criarAgenteProvider,
  desconectarProvider,
  fetchProviders,
  testarProvider,
  type Preset,
  type Provider,
} from "./api.ts";

/**
 * Conectar um provedor é dizer ao cockpit qual comando chamar. Nenhuma
 * credencial passa por aqui: cada CLI já é autenticado por fora, na conta que
 * você paga. Por isso a tela mostra "instalado" e "responde", não "logado".
 */
export function Config({ onFechar, onMudou }: { onFechar: () => void; onMudou: () => void }) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [testes, setTestes] = useState<Record<string, { ok: boolean; saida: string }>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const [novo, setNovo] = useState<{ id: string; comando: string; modelos: string } | null>(null);

  const recarregar = (rescan = false) =>
    fetchProviders(rescan).then((d) => {
      setProviders(d.providers);
      setPresets(d.presets);
    }, (e: Error) => setErro(e.message));

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

  const conectados = new Set(providers.map((p) => p.id));
  const disponiveis = presets.filter((p) => !conectados.has(p.id));

  // A moldura (título e fechar) é da janela de ajustes; aqui só o conteúdo.
  void onFechar;

  return (
    <div className="config">
      {erro && (
        <div className="aviso">
          {erro}
          <button onClick={() => setErro(null)}>✕</button>
        </div>
      )}

      <div className="wizard-corpo">
        <p className="dica">
          O cockpit não guarda chave nem senha: ele só sabe chamar os CLIs que já estão autenticados
          na sua máquina, com as assinaturas que você já paga.
        </p>

        <div className="campo-bloco">
          <span className="rotulo">
            Conectados
            <button
              className="btn"
              disabled={ocupado}
              title="Varre o PATH de novo — use depois de instalar um CLI"
              onClick={() => guardado(async () => { await recarregar(true); })}
            >
              Procurar de novo
            </button>
          </span>
          <div className="lista-prov">
            {providers.map((p) => (
              <div key={p.id} className={`prov${p.disponivel ? " on" : ""}`}>
                <span className="prov-luz" />
                <div className="prov-corpo">
                  <b>{p.id}</b>
                  <span className="prov-cmd" title={p.caminho ?? p.comando}>
                    {p.caminho ?? p.comando}
                  </span>
                  <span className="prov-agentes">
                    {p.agentes.length > 0 ? p.agentes.join(", ") : "nenhum agente usa ainda"}
                    {p.modelos.length > 0 && ` · ${p.modelos.length} modelos`}
                  </span>
                  {!p.disponivel && p.instalar && (
                    <span className="prov-instalar">
                      não encontrado — instale com <code>{p.instalar}</code>
                    </span>
                  )}
                  {testes[p.id] && (
                    <span className={`prov-teste${testes[p.id]!.ok ? " ok" : " falhou"}`}>
                      {testes[p.id]!.saida}
                    </span>
                  )}
                </div>
                {p.agentes.length === 0 && (
                  <button
                    className="btn solid"
                    disabled={ocupado}
                    title="Sem agente o provedor não aparece em nenhuma missão"
                    onClick={() => guardado(() => criarAgenteProvider(p.id).then(() => undefined))}
                  >
                    Criar agente
                  </button>
                )}
                <button
                  className="btn"
                  disabled={ocupado}
                  onClick={() =>
                    guardado(async () => {
                      const r = await testarProvider(p.id);
                      setTestes((t) => ({ ...t, [p.id]: r }));
                    })
                  }
                >
                  Testar
                </button>
                <button
                  className="btn quiet"
                  disabled={ocupado}
                  title="Tira do cockpit; não desinstala nada"
                  onClick={() => guardado(() => desconectarProvider(p.id).then(() => undefined))}
                >
                  Remover
                </button>
              </div>
            ))}
          </div>
        </div>

        {disponiveis.length > 0 && (
          <div className="campo-bloco">
            <span className="rotulo">Conectar</span>
            <div className="cartas">
              {disponiveis.map((p) => (
                <button
                  key={p.id}
                  className="carta"
                  disabled={ocupado}
                  onClick={() =>
                    guardado(() =>
                      conectarProvider({
                        id: p.id,
                        comando: p.comando,
                        modelos: p.modelos,
                      }).then(() => undefined),
                    )
                  }
                >
                  <b>{p.label}</b>
                  <span>
                    comando <code>{p.comando}</code>
                  </span>
                  {p.nota && <span className="fases-mini">{p.nota}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="campo-bloco">
          <span className="rotulo">
            Outro CLI <em>— qualquer programa de terminal que fale com um agente</em>
          </span>
          {novo === null ? (
            <div>
              <button className="btn" onClick={() => setNovo({ id: "", comando: "", modelos: "" })}>
                Adicionar manualmente
              </button>
            </div>
          ) : (
            <div className="form-inline">
              <input
                className="campo"
                autoFocus
                placeholder="nome (ex: kimi)"
                value={novo.id}
                onChange={(e) => setNovo({ ...novo, id: e.target.value })}
              />
              <input
                className="campo"
                placeholder="comando (ex: kimi) ou caminho completo do .exe"
                value={novo.comando}
                onChange={(e) => setNovo({ ...novo, comando: e.target.value })}
              />
              <input
                className="campo"
                placeholder="modelos separados por vírgula (opcional)"
                value={novo.modelos}
                onChange={(e) => setNovo({ ...novo, modelos: e.target.value })}
              />
              <div className="form-acoes">
                <button className="btn quiet" onClick={() => setNovo(null)}>
                  Cancelar
                </button>
                <button
                  className="btn solid"
                  disabled={ocupado || !novo.id.trim() || !novo.comando.trim()}
                  onClick={() =>
                    guardado(async () => {
                      await conectarProvider({
                        id: novo.id.trim(),
                        comando: novo.comando.trim(),
                        modelos: novo.modelos
                          .split(",")
                          .map((m) => m.trim())
                          .filter(Boolean),
                      });
                      setNovo(null);
                    })
                  }
                >
                  Conectar
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="ressalva">
          Isto grava no <code>cockpit.json</code>. Depois de conectar, crie um agente lá apontando
          para o provedor novo — é o agente que junta CLI, modelo, esforço e papel.
        </p>
      </div>
    </div>
  );
}
