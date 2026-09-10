import { config, type AgentSpec, type Elenco, type TipoTarefa } from "./config.ts";
import { execucaoDoPapel } from "./politica-ia.ts";

/**
 * Harness: o bundle de execução de uma tarefa — cli + modelo + effort.
 *
 * A tese é que o modelo não é o teto: o mesmo modelo entrega mais ou menos
 * conforme é usado. Então quem decide não é o agente, é o TIPO da tarefa.
 * Trabalho mecânico roda em modelo barato com esforço baixo; raciocínio denso
 * roda em modelo forte com esforço alto. Você não queima token caro em tarefa
 * burra, e não entrega tarefa difícil para configuração fraca.
 *
 * Cada tipo conhece o equivalente dele em cada provedor: "arquitetura" é opus
 * no Claude, gemini-3.1-pro no Gemini e gpt-6-astra no Codex. Assim o agente
 * pode trocar de provedor sem perder o nível da tarefa.
 *
 * A resolução é determinística, por precedência:
 *   1. o que o elenco da missão fixa    (mais forte — é a sua escolha)
 *   2. o que o roster do time fixa
 *   3. o que a invocação pede
 *   4. o tipo da tarefa, na versão do provedor escolhido
 *   5. o default do agente no catálogo  (mais fraco)
 *
 * O elenco é um portão: um provedor fora dele não abre painel nenhum. O
 * `clis` de um tipo de tarefa estreita esse portão, mas não abre um sozinho:
 * sem elenco, o provedor do agente é respeitado.
 * Se o agente escolhido pertence a um CLI barrado, ele é trocado pelo primeiro
 * provedor liberado que sirva à tarefa — o papel do agente é preservado, só a
 * execução muda. É assim que "site é com o Claude, imagem é com o Gemini"
 * deixa de ser um pedido no prompt e vira regra do cockpit.
 */

export type Harness = {
  cli: string;
  model?: string;
  effort?: string;
  /** De onde veio cada peça, para a interface poder mostrar. */
  origem: { cli: string; model: string; effort: string };
  /** Preenchido quando o elenco trocou o provedor do agente. */
  trocado?: { de: string; porque: string };
};

export type Pedido = {
  agent: string;
  /** Tipo da tarefa: chave de harness.tipos no cockpit.json. */
  tipo?: string;
  /** O que o roster do time fixou para este agente nesta fase. */
  roster?: Partial<Pick<Harness, "cli" | "model" | "effort">>;
  /** O que a chamada pediu explicitamente. */
  invoke?: Partial<Pick<Harness, "cli" | "model" | "effort">>;
  /** Quais IAs esta missão liberou. */
  elenco?: Elenco;
};

export const tiposDeTarefa = (): Record<string, TipoTarefa> => config.harness?.tipos ?? {};

/**
 * O valor pertence a este CLI? Sem lista declarada, aceitamos qualquer um.
 * A comparação é exata de propósito: "claude-opus-4-6-thinking" contém
 * "opus", e uma checagem por substring deixaria um modelo do Claude passar
 * por modelo da Antigravity.
 */
function aceita(lista: string[] | undefined, valor: string | undefined): boolean {
  if (!valor) return false;
  if (!lista || lista.length === 0) return true;
  return lista.includes(valor);
}

/** Primeiro valor definido na ordem da precedência, com o nome da fonte. */
function escolher(candidatos: [string, string | undefined][]): [string | undefined, string] {
  for (const [fonte, valor] of candidatos) {
    if (valor) return [valor, fonte];
  }
  return [undefined, "nada"];
}

/** A tarefa é de imagem/vídeo? Só então quem é "só visual" pode entrar. */
const ehVisual = (tipo: TipoTarefa | undefined): boolean => tipo?.visual === true;

/**
 * Quem pode receber esta tarefa: o elenco menos os que só fazem visual, ou
 * só os que fazem visual quando a tarefa é visual. Um tipo de tarefa também
 * pode fechar a porta — "site" não vai para o Gemini nem se ele estiver no
 * elenco. Sem elenco declarado, ninguém é trocado.
 */
function liberados(elenco: Elenco | undefined, tipo: TipoTarefa | undefined): string[] | null {
  const doTipo = tipo?.clis?.length ? tipo.clis : null;

  // Sem elenco declarado o tipo NÃO troca ninguém de provedor.
  //
  // O portão é do elenco: é você quem diz quais IAs entram na missão. O
  // `clis` do tipo serve para estreitar essa lista, não para agir sozinho —
  // porque agindo sozinho ele fazia uma tarefa "visual" delegada ao ASTRA
  // abrir um painel de Gemini com o papel do ASTRA colado dentro. O agente
  // dizia ser GPT, o modelo era outro, e ninguém no meio avisava.
  if (!elenco || elenco.clis.length === 0) return null;

  const soVisual = new Set(elenco.soVisual ?? []);
  const base = ehVisual(tipo)
    ? elenco.clis.filter((c) => soVisual.has(c) || !doTipo || doTipo.includes(c))
    : elenco.clis.filter((c) => !soVisual.has(c));
  const cruzado = doTipo ? base.filter((c) => doTipo.includes(c)) : base;

  // Cruzamento vazio significa que ninguém do elenco faz este tipo. Melhor
  // devolver o elenco do que abrir num provedor que você barrou.
  return cruzado.length > 0 ? cruzado : base.length > 0 ? base : elenco.clis;
}

export function resolverHarness(pedido: Pedido): Harness {
  const spec: AgentSpec | undefined = config.agents[pedido.agent];
  if (!spec) {
    throw new Error(
      `não existe agente "${pedido.agent}". Disponíveis: ${Object.keys(config.agents).join(", ")}`,
    );
  }
  const fixo = execucaoDoPapel(pedido.agent);
  if (fixo) return { ...fixo, origem: { cli: "configuração de IA", model: "configuração de IA", effort: "configuração de IA" } };
  const tipo = pedido.tipo ? tiposDeTarefa()[pedido.tipo] : undefined;

  // O CLI é decidido primeiro: ele define quais modelos e esforços existem.
  const [cli, deCli] = escolher([
    ["roster", pedido.roster?.cli],
    ["invocação", pedido.invoke?.cli],
    ["catálogo", spec.cli],
  ]);
  let finalCli = cli ?? spec.cli;
  let deFinalCli = deCli;
  let trocado: Harness["trocado"];

  // O portão do elenco. Trocar é melhor do que falhar: o painel abre com o
  // papel certo, só que no provedor que você liberou.
  const permitidos = liberados(pedido.elenco, tipo);
  if (permitidos && !permitidos.includes(finalCli)) {
    const substituto = permitidos.find((c) => tipo?.porCli?.[c]) ?? permitidos[0]!;
    trocado = {
      de: finalCli,
      porque: `${finalCli} não recebe tarefa ${tipo?.label ? `"${tipo.label}"` : "deste tipo"} nesta missão`,
    };
    finalCli = substituto;
    deFinalCli = "elenco da missão";
  }

  // Com o CLI na mão, o tipo oferece a versão dele para aquele provedor.
  const doTipo = tipo?.porCli?.[finalCli];
  // O tipo pode ajustar o modelo dentro do provedor escolhido, mas não
  // trocar o CLI nem importar os defaults exclusivos de outro provedor.
  const defaultsDoTipo = !tipo?.cli || tipo.cli === finalCli ? tipo : undefined;

  const fixado = pedido.elenco?.porCli?.[finalCli];

  const [model, deModel] = escolher([
    ["elenco da missão", fixado?.model],
    ["roster", pedido.roster?.model],
    ["invocação", pedido.invoke?.model],
    ["tipo da tarefa", doTipo?.model ?? defaultsDoTipo?.model],
    ["catálogo", spec.model],
  ]);

  const [effort, deEffort] = escolher([
    ["elenco da missão", fixado?.effort],
    ["roster", pedido.roster?.effort],
    ["invocação", pedido.invoke?.effort],
    ["tipo da tarefa", doTipo?.effort ?? defaultsDoTipo?.effort],
    ["catálogo", spec.effort],
  ]);

  // Rede de segurança: se sobrou valor de outro provedor, desce para o do
  // agente. Zerar seria pior — sem modelo o CLI usa o que estiver salvo nele,
  // e um agente chamado ASTRA viraria "o que o Codex tiver guardado".
  //
  // Quando o elenco trocou o provedor, o modelo do catálogo é do provedor
  // errado por definição, então o último recurso é o meio-termo daquele CLI:
  // o que o tipo "implementar" usa nele.
  const modelos = config.modelos?.[finalCli];
  const efforts = config.efforts?.[finalCli];
  const meioTermo = tiposDeTarefa().implementar?.porCli?.[finalCli];

  let finalModel = model;
  let deFinalModel = deModel;
  if (!aceita(modelos, finalModel)) {
    const alternativa = aceita(modelos, spec.model)
      ? spec.model
      : aceita(modelos, meioTermo?.model)
        ? meioTermo?.model
        : modelos?.[0];
    finalModel = alternativa;
    deFinalModel = finalModel ? `padrão de ${finalCli} (o pedido não serve nele)` : "nenhum que sirva";
  }

  let finalEffort = effort;
  let deFinalEffort = deEffort;
  if (!aceita(efforts, finalEffort)) {
    const alternativa = aceita(efforts, spec.effort)
      ? spec.effort
      : aceita(efforts, meioTermo?.effort)
        ? meioTermo?.effort
        : efforts?.[0];
    finalEffort = alternativa;
    deFinalEffort = finalEffort
      ? `padrão de ${finalCli} (${effort ?? "—"} não existe nele)`
      : "nenhum que sirva";
  }

  return {
    cli: finalCli,
    model: finalModel,
    effort: finalEffort,
    origem: { cli: deFinalCli, model: deFinalModel, effort: deFinalEffort },
    trocado,
  };
}

/**
 * Preço de saída por milhão de tokens, só para comparar opções.
 * Não é previsão de gasto: é a régua que mostra o que é caro e o que é barato.
 */
export function precoRelativo(cli: string, model: string | undefined): number | null {
  if (cli !== "claude" || !model) return null;
  const chave = Object.keys(config.precos).find((k) => k.includes(model));
  const p = chave ? config.precos[chave] : undefined;
  return p ? p.out : null;
}
