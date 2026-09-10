import { useEffect, useState } from "react";
import {
  apagarSkill,
  fetchSkill,
  fetchSkills,
  fetchSkillsDoAgente,
  salvarSkill,
  salvarSkillsDoAgente,
  type AgentSpec,
  type Acervo,
  type Skill,
  type SkillsDoAgente,
} from "./api.ts";

/**
 * O acervo de skills.
 *
 * Uma skill é instrução instalável: um arquivo que muda como o agente
 * trabalha, sem mexer em código. A tela responde três perguntas, nessa ordem:
 * o que eu tenho, quem carrega o quê, e o que essa aqui manda fazer.
 *
 * O que entra no prompt do agente é só o índice — nome e descrição. Por isso
 * a descrição aparece em destaque aqui: é por ela que o agente decide abrir
 * o arquivo, e uma descrição vaga é uma skill que nunca é usada.
 */

const NOVA = { nome: "", descricao: "", papeis: "", corpo: "" };

export function Skills({ agents }: { agents: Record<string, AgentSpec> }) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [acervo, setAcervo] = useState<Acervo | null>(null);
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<(Skill & { corpo: string }) | null>(null);
  const [editando, setEditando] = useState<typeof NOVA | null>(null);
  const [agente, setAgente] = useState<string>("");
  const [doAgente, setDoAgente] = useState<SkillsDoAgente | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const recarregar = () =>
    fetchSkills().then(
      (d) => {
        setSkills(d.skills ?? []);
        setAcervo(d.acervo ?? null);
      },
      (e: Error) => setErro(e.message),
    );

  useEffect(() => {
    void recarregar();
  }, []);

  useEffect(() => {
    if (!agente) return setDoAgente(null);
    void fetchSkillsDoAgente(agente).then(setDoAgente, (e: Error) => setErro(e.message));
  }, [agente]);

  const guardado = async (fn: () => Promise<void>) => {
    setOcupado(true);
    setErro(null);
    try {
      await fn();
      await recarregar();
      if (agente) setDoAgente(await fetchSkillsDoAgente(agente));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  };

  const carregadas = new Set(doAgente?.skills?.map((s) => s.nome) ?? []);

  const alvo = busca.trim().toLowerCase();
  const filtradas = alvo
    ? skills.filter((s) => `${s.nome} ${s.descricao}`.toLowerCase().includes(alvo))
    : skills;
  // Com um agente escolhido, o que ele carrega sobe: foi para ver isso que
  // você escolheu o agente. Sem agente, ordem alfabética e pronto.
  const achadas = doAgente
    ? [...filtradas].sort(
        (a, b) => Number(carregadas.has(b.nome)) - Number(carregadas.has(a.nome)),
      )
    : filtradas;

  const fixas = new Set(doAgente?.fixas ?? []);
  const travado = doAgente?.allowedSkills !== null && doAgente?.allowedSkills !== undefined;

  if (editando) {
    return (
      <div className="wizard-corpo">
        <div className="campo-bloco">
          <span className="rotulo">Nome <em>— sem espaço; é assim que o agente chama</em></span>
          <input
            className="campo"
            autoFocus
            value={editando.nome}
            onChange={(e) => setEditando({ ...editando, nome: e.target.value })}
            placeholder="revisar-pr"
          />
        </div>
        <div className="campo-bloco">
          <span className="rotulo">
            Descrição <em>— é só isto que entra no prompt. Diga QUANDO usar, não o que faz.</em>
          </span>
          <input
            className="campo"
            value={editando.descricao}
            onChange={(e) => setEditando({ ...editando, descricao: e.target.value })}
            placeholder="Use ao revisar um pull request, antes de aprovar ou pedir mudanças."
          />
        </div>
        <div className="campo-bloco">
          <span className="rotulo">
            Papéis <em>— quem recebe esta skill sozinho ao nascer. Vazio = ninguém automático.</em>
          </span>
          <input
            className="campo"
            value={editando.papeis}
            onChange={(e) => setEditando({ ...editando, papeis: e.target.value })}
            placeholder="revisar, auditar"
          />
        </div>
        <div className="campo-bloco cresce">
          <span className="rotulo">Instrução</span>
          <textarea
            className="campo corpo-skill"
            value={editando.corpo}
            onChange={(e) => setEditando({ ...editando, corpo: e.target.value })}
            placeholder={"# Como revisar\n\n1. Leia o diff inteiro antes de comentar.\n2. …"}
          />
        </div>
        {erro && <div className="aviso">{erro}<button onClick={() => setErro(null)}>✕</button></div>}
        <div className="form-acoes">
          <button className="btn quiet" onClick={() => setEditando(null)}>Cancelar</button>
          <button
            className="btn solid"
            disabled={ocupado || !editando.nome.trim() || !editando.descricao.trim()}
            onClick={() =>
              guardado(async () => {
                await salvarSkill({
                  nome: editando.nome.trim(),
                  descricao: editando.descricao.trim(),
                  papeis: editando.papeis.split(",").map((x) => x.trim()).filter(Boolean),
                  corpo: editando.corpo,
                });
                setEditando(null);
              })
            }
          >
            Salvar skill
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wizard-corpo">
      {erro && <div className="aviso">{erro}<button onClick={() => setErro(null)}>✕</button></div>}

      <div className="barra-acervo">
        <input
          className="campo"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar skill…"
          aria-label="Buscar skill"
        />
        <select
          className="picker"
          value={agente}
          onChange={(e) => setAgente(e.target.value)}
          aria-label="Ver o que um agente carrega"
          title="Escolha um agente para ver e mudar o que ele carrega"
        >
          <option value="">ver por agente…</option>
          {Object.entries(agents).map(([id, a]) => (
            <option key={id} value={id}>{a.label}</option>
          ))}
        </select>
        <button className="btn" onClick={() => setEditando({ ...NOVA })}>Escrever skill</button>
      </div>

      {acervo && (
        <p className="dica">
          <b>{acervo.total}</b> skills no acervo
          {Object.entries(acervo.porOrigem).map(([k, v]) => ` · ${v} de ${k}`).join("")}. As de outro
          CLI valem aqui sem cópia; instalar pelo marketplace é o que faz uma skill valer para
          todos os provedores.
        </p>
      )}

      {doAgente && (
        <div className="painel-agente">
          <div className="linha-agente">
            <b>{agents[agente]?.label ?? agente}</b>
            <span className="prov-cmd">papel <code>{doAgente.papel_id}</code></span>
            <span className="spacer" />
            <span className="prov-cmd">carrega {doAgente.skills?.length ?? 0}</span>
            <button
              className={`btn${travado ? " on" : ""}`}
              disabled={ocupado}
              title={
                travado
                  ? "Hoje só as marcadas entram, mesmo as automáticas. Clique para soltar."
                  : "Hoje entra tudo o que o papel trouxer. Clique para fechar a lista no que está marcado."
              }
              onClick={() =>
                guardado(async () => {
                  await salvarSkillsDoAgente(agente, {
                    allowedSkills: travado ? null : [...carregadas],
                  });
                })
              }
            >
              {travado ? "lista fechada" : "sem restrição"}
            </button>
          </div>
          <p className="dica">
            Marcar fixa a skill neste agente. A trava corta até o que se auto-instala pelo papel —
            é regra, não pedido.
          </p>
        </div>
      )}

      <div className="lista-skills">
        {achadas.length === 0 && <p className="vazio-nota">Nada com esse nome.</p>}
        {achadas.map((s) => {
          const carrega = carregadas.has(s.nome);
          return (
            <div key={s.nome} className={`skill${carrega ? " carrega" : ""}`}>
              {doAgente && (
                <input
                  type="checkbox"
                  checked={fixas.has(s.nome)}
                  disabled={ocupado}
                  aria-label={`Fixar ${s.nome} em ${agente}`}
                  title={
                    carrega && !fixas.has(s.nome)
                      ? "vem sozinha pelo papel do agente"
                      : "fixar nesta agente"
                  }
                  onChange={(e) =>
                    guardado(async () => {
                      const proximas = e.target.checked
                        ? [...fixas, s.nome]
                        : [...fixas].filter((x) => x !== s.nome);
                      await salvarSkillsDoAgente(agente, { skills: proximas });
                    })
                  }
                />
              )}
              <button
                className="skill-toque"
                onClick={() =>
                  fetchSkill(s.nome).then(setAberta, (e: Error) => setErro(e.message))
                }
              >
                <b>{s.nome}</b>
                <span className="skill-desc">{s.descricao || "sem descrição"}</span>
              </button>
              <span className="skill-origem" title={s.caminho}>{s.origem}</span>
              {s.editavel && (
                <button
                  className="icon-btn apagar"
                  disabled={ocupado}
                  title="apagar do acervo"
                  onClick={() => guardado(() => apagarSkill(s.nome).then(() => undefined))}
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>

      {aberta && (
        <div className="leitor" role="dialog" aria-label={`Skill ${aberta.nome}`}>
          <header>
            <b>{aberta.nome}</b>
            <span className="prov-cmd">{aberta.caminho}</span>
            <span className="spacer" />
            {aberta.editavel && (
              <button
                className="btn"
                onClick={() => {
                  setEditando({
                    nome: aberta.nome,
                    descricao: aberta.descricao,
                    papeis: (aberta.papeis ?? []).join(", "),
                    corpo: aberta.corpo,
                  });
                  setAberta(null);
                }}
              >
                Editar
              </button>
            )}
            <button className="btn quiet" onClick={() => setAberta(null)} aria-label="Fechar">✕</button>
          </header>
          <pre>{aberta.corpo}</pre>
        </div>
      )}
    </div>
  );
}
