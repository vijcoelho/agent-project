# Cockpit — análise e melhorias

## Ponte de provedor e modelos grátis — atualização

- O OpenRouter entrou como **ponte**: um provedor que é API, não programa. O
  Cockpit empresta o binário do Codex e o aponta para outra `base_url`, com a
  chave injetada só no ambiente do processo do painel. `clis.<id>.ponte` no
  `cockpit.json` descreve tudo; `familia` diz de quem o provedor herda o
  tratamento de argumentos.
- Verificado nesta máquina: o Codex 0.154 **removeu** `wire_api = "chat"` e só
  aceita `"responses"`. O OpenRouter publica `/api/v1/responses`, então a ponte
  usa esse formato. Um provedor que só ofereça `/chat/completions` não serve
  para este CLI.
- `scripts/check-ponte.mjs` sobe um servidor que finge ser o provedor, abre um
  painel de verdade por `spawnPane` e confere no lado do servidor o que chegou:
  método, `Authorization`, modelo e o papel do agente dentro do `input`.
  Também confere que a chave não foi parar no `cockpit.json`. Nenhuma chave
  real e nenhum token gasto — o que se prova é o encanamento, que é o que muda
  de versão para versão do Codex.
- O catálogo é lido ao vivo em `/api/v1/models`, filtrado por preço zero nos
  dois lados e ordenado por suporte a ferramentas. Sem ferramentas o modelo
  conversa mas não edita arquivo, e a tela mostra isso em vez de deixar você
  descobrir num painel morto. "Atualizar modelos" preserva o modelo que você
  já tinha escolhido.
- **Não verificado:** nenhuma chamada com chave real foi feita, porque não há
  chave de OpenRouter nesta máquina. O botão **Testar de verdade** existe para
  fechar essa lacuna do lado de quem tem a chave: ele chama a mesma URL, com o
  mesmo corpo, e devolve o erro do provedor sem interpretação.
- A ponte também virou destino de failover: quando todas as cotas pagas
  estouram, o maestro migra para o modelo grátis em vez de parar a missão. Ela
  entra por último na ordem, porque é pior que uma assinatura e melhor que
  nada.
- A cota do OpenRouter vem de `/api/v1/key`. Numa conta gratuita não há teto em
  dólar e o endpoint não diz quantas requisições você já fez no dia, então o
  estado é "desconhecido" com o limite declarado ao lado — nunca "livre".

## Correções encontradas ao revisar esta entrega

- `scripts/check-harness.ts` estava **vermelho no commit anterior**: o `clis` de
  um tipo de tarefa trocava o provedor do agente mesmo sem elenco declarado, e
  uma tarefa "visual" delegada ao ASTRA abria um painel de Gemini com o papel
  do ASTRA colado dentro. O portão voltou a ser do elenco; o tipo só estreita.
- Uma resposta fora do formato em `/api/politica-ia` derrubava o **cockpit
  inteiro** para a página de "a tela quebrou", porque a tela lia
  `dados.providers.filter` sem conferir o formato. Agora é um aviso dentro da
  própria seção. O teste de interface cobre o caso.
- O `ResizeObserver` de cada painel lia `host.current!.clientHeight` depois da
  desmontagem e estourava um `TypeError` por painel ao fechar um projeto. O
  elemento passou a ser guardado numa constante do efeito.
- `npm test` não existia: os testes estavam na pasta, mas nada rodava todos.
  Agora `scripts/testar.mjs` roda tipos, build e todos os `check-*`, pulando os
  de navegador quando o Playwright não é informado.
- `COCKPIT_PORTA` completa o par `COCKPIT_CONFIG`/`COCKPIT_HOME`: sem uma porta
  própria, uma segunda instância isolada morria em cima da primeira.
- O cofre de chaves saiu de `media.ts` para `servidor/cofre.ts`, porque a ponte
  precisava do mesmo mecanismo e dois cofres seriam dois bugs.

## Maestro e continuidade — atualização

- GPT/Codex passou a ser o maestro padrão (`gpt-6-astra`, esforço alto). A janela **Maestro** permite salvar provedor/modelo/esforço e trocar a coordenação da missão aberta. O papel de maestro permanece separado do provedor.
- Codex recebe modelo e esforço por argumentos, além do MCP do cockpit com variáveis próprias da missão. AGY usa uma ponte de ferramentas HTTP pelo terminal quando não há MCP por sessão.
- A cota do Codex é consultada via `account/rateLimits/read` do [App Server oficial](https://learn.chatgpt.com/docs/app-server). Consulta real validada, sem executar uma tarefa de IA. Com painéis Codex abertos, consulta a cada minuto; também há botão Atualizar cota.
- Claude e AGY: detecção heurística de mensagens explícitas no terminal, sem porcentagem presumida. Ausência de aviso significa cota desconhecida, não cota livre.
- Até 10% restante: maestro pode transferir no próximo checkpoint. Em bloqueio explícito de um painel, troca para outro provedor instalado sem aviso de limite, com modelo forte. Não há garantia de detecção de todas as variações de mensagem de cada versão dos CLIs.
- O processo anterior é encerrado antes do sucessor. O substituto recebe objetivo, memória, último checkpoint e caminho do histórico JSONL completo. Especialistas mantêm a responsabilidade do painel de origem. Não transfere raciocínio interno nem garante qualidade idêntica entre modelos; a retomada instrui a validar arquivos e testes.
- Histórico e checkpoints ficam em `~/.cockpit/continuity/<missão>/`. A captura começa nesta versão; conversas anteriores à atualização não são importadas automaticamente. IDs de painel são únicos entre reinícios.
- Ao fechar/trocar projeto, a interface limpa missão, árvore, editor e memória e ignora respostas antigas. O servidor também rejeita escopos de missão de projeto fechado.
- Testes: TypeScript, build, regressão do harness, sinais/cotas/checkpoints, Chromium (incluindo resposta atrasada após fechar projeto) e integração com backend e PTYs reais usando CLIs falsos. A integração confirmou uma troca única de Codex para Claude com checkpoint preservado; não executou modelos reais.
- `COCKPIT_CONFIG` e `COCKPIT_HOME` permitem testes com configuração e estado isolados.

## Direção

Ferramenta pessoal para coordenar agentes em projetos locais. A referência é o [Overclock](https://overclock.sh/en), especialmente a organização por missões, agentes em painéis e acompanhamento do trabalho. Esta entrega melhora a interface existente; não implementa paridade completa com o produto de referência.

## O que mudou

- Preto e azul preservados, com superfícies distintas, texto secundário mais legível e botões com maior área de interação.
- Tela inicial com abertura de projeto, explicação do fluxo e ações nos estados sem missão ou sem agente.
- Navegação recolhível, busca por nome ou objetivo da missão e adaptação a janelas estreitas.
- Barra de contexto com acesso ao consumo e configuração, além do estado real do WebSocket.
- Grade de terminais com seleção de uma, duas ou três colunas. Em celular, uma coluna; layout automático limitado a duas colunas em janelas intermediárias.
- Aviso e ação de recarregar após desconexão; abertura de painel desabilitada quando desconectado. Conexões HTTPS utilizam WSS.
- Editor carregado sob demanda, reduzindo o bundle inicial de aproximadamente 1.103 KB para 595 KB antes de gzip.
- Texto de isolamento corrigido: worktrees isolam missões; agentes da mesma missão compartilham arquivos.

## Prioridades para a próxima evolução

Os dois primeiros itens desta lista já estavam feitos quando esta revisão
começou — a edição pendente pergunta antes de descartar e o socket reconecta
sozinho, ambos cobertos por `scripts/check-edicao.mjs`. O que sobra:

1. **Tratar falhas de carregamento em toda parte.** A tela de distribuição de
   IA foi corrigida por ter derrubado o aplicativo, mas o padrão de confiar no
   formato da resposta se repete em outras telas. Vale uma checagem única na
   camada de `api.ts`, em vez de uma por componente.
2. **Acompanhar entregas:** consolidar objetivo, fase, arquivos alterados e
   resultado da missão numa visão de revisão. A interface já tem os elementos
   fundamentais; falta reunir o resultado final para aprovação.
3. **Provar a ponte com chave real.** O encanamento está testado com servidor
   falso; falta um relato de uma missão inteira rodada num modelo grátis, para
   saber quais deles aguentam o harness do Codex e quais se perdem.
4. **Consumo dos provedores que não são Claude.** A tela de consumo lê o
   histórico do Claude Code; Codex, AGY e a ponte só aparecem em cota. O
   OpenRouter publica gasto por chave e daria para somar ali.
5. **Validar integração real:** testar squads, CLIs, worktrees, retomada de
   sessões e consumo com um projeto descartável antes de depender do cockpit em
   projetos importantes.

## Validação desta entrega

`npm test -- <playwright>`: 15 verificações, nenhuma falha. Inclui `tsc`, o
build, os testes de navegador em Chromium e o teste de ponte com PTY real.

Também verificado fora da bateria, com o servidor de verdade numa porta
isolada (`COCKPIT_PORTA=3457`): `/api/pontes` lendo o catálogo ao vivo do
OpenRouter (22 modelos grátis, 19 com ferramentas), o provedor aparecendo como
indisponível enquanto falta a chave, a sincronização gravando no `cockpit.json`
sem trocar o modelo escolhido, e o teste sem chave recusando com a instrução
certa em vez de erro genérico.

O Vite continua avisando sobre chunks acima de 500 KB. Nenhum agente real foi
iniciado, nenhuma chave real foi usada e nenhum projeto pessoal foi alterado.

Para repetir os testes de interface, instale o Playwright no ambiente de testes
ou informe um caminho existente: `npm test -- <caminho-para-playwright-core/index.mjs>`.
