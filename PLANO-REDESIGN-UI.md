# Plano de redesign do Cockpit

Atualizado em 10/09/2026. O documento começou como planejamento; a implementação está em curso e o checkpoint abaixo diz onde ela parou.

> CHECKPOINT DE IMPLEMENTAÇÃO — 10/09/2026 (3ª atualização). O plano abaixo
> continua como histórico; este checkpoint prevalece, inclusive sobre a seção 5
> (as "ilhas de agentes" foram descartadas pelo usuário).
>
> CORREÇÃO DE RUMO PEDIDA PELO USUÁRIO, já implementada:
> 1. As missões saíram do topo e foram para uma lateral estilo VS Code, em
>    árvore: cada missão abre mostrando seus agentes, como uma pasta abre seus
>    arquivos. Dez missões coexistem na lista sem trocar de tela.
> 2. A tela principal é o terminal e nada mais. Não existe mais grade de
>    cartões de agente, nem visão geral, nem trilho lateral de agentes.
> 3. Controles secundários (Arquivos, Atividade, Ajustes, PT/PT→EN, Ditar,
>    estado da conexão e alerta de cota) moram no rodapé da lateral. O topo do
>    palco tem uma linha só: nome da missão (abre detalhes) e o seletor
>    Um/Todos, com as colunas aparecendo apenas em Todos.
>
> Arquivos: novos web/Lateral.tsx (a árvore) e web/rotulos.ts (nome e estado de
> um painel, compartilhados entre lateral e terminal); PaneGrid.tsx virou só o
> palco dos terminais; App.tsx trocou deck/bench/header/rodapé por shell +
> lateral + palco; islands.css reescrito; Modal.tsx mantém a cadeia de foco.
>
> Ciclo de vida preservado: todos os Panes continuam montados o tempo todo, de
> todas as missões. Trocar de agente ou de missão só muda quem está visível —
> não há kill, spawn nem perda de scrollback, e o check prova isso trocando de
> missão com saída chegando no terminal escondido. Trocar de missão continua
> passando pela proteção de edição pendente (trocar()).
>
> Verificado nesta rodada: tsc, vite build, check-ui e check-edicao passaram.
> O check-ui cobre agora: duas missões na lateral; a missão ativa abre com um
> único terminal na tela; trocar de agente e de missão preserva a instância do
> xterm e a saída recebida enquanto escondido; doze agentes na árvore sem
> rolagem horizontal e com nome longo contido; Enter na lateral abre o terminal
> e o foco fica na lateral; Um/Todos e colunas; gaveta no mobile que começa
> fora da tela, abre e fecha ao escolher um agente. Screenshots revisados:
> ui-lateral, ui-workspace, ui-desktop, ui-mobile-lateral, ui-mobile-focus.
>
> Como rodar os checks de navegador aqui: não há playwright no projeto. Existe
> playwright-core 1.62.1 em
> %LOCALAPPDATA%/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core e
> os navegadores são chromium-1223/1228 (a versão espera 1234), então é preciso
> CHROME_PATH=%LOCALAPPDATA%/ms-playwright/chromium-1228/chrome-win64/chrome.exe.
>
> MASCOTES E ILHA (4ª atualização, mesmo dia), a partir do print
> Downloads/veja-aqui.png e da referência bloub.vercel.app:
>
> - web/Mascote.tsx: SVG próprio no modelo do bloub (forma + expressão + cor +
>   animação discreta). Seis corpos — círculo, seixo, squircle, cápsula,
>   hexágono, gota — escolhidos por hash do id do agente, nunca pela posição.
>   A expressão vem do estado real do painel: em atividade (olhos abertos,
>   sorriso), sem atividade recente (olhos fechados), encerrado ou sem conexão
>   (cinza, traços retos, sem animação). Nada de progresso inventado.
> - Animação: corpo respira (mais rápido em atividade) e olhos piscam; some
>   inteira sob prefers-reduced-motion e em encerrado/sem conexão.
> - Onde aparece: na linha de cada agente na lateral (substituiu o ponto), no
>   cabeçalho do terminal (substituiu a luz) e, maior e animado, no canto
>   superior direito do palco, mostrando o agente em foco.
> - As missões agora moram numa ilha (.mission-island): cartão arredondado
>   dentro da lateral, em vez de linhas soltas no fundo.
> - Cores vêm de AgentSpec.cor/PaneState.cor; o cockpit.json real já traz 15
>   cores distintas, uma por agente. O bloub não foi copiado nem embutido: só
>   o modelo (forma/expressão/cor/animação) serviu de referência.
> - check-ui cobre: mascote por agente, cara de trabalhando só em quem está em
>   atividade, encerrado sem aparência de vivo, e a ilha das missões.
>
> ARQUIVOS VIROU PÁGINA DA LATERAL (5ª atualização, mesmo dia), a pedido do
> usuário: a árvore não abre mais um painel próprio ao lado do terminal.
>
> - A lateral tem duas páginas irmãs, num seletor só: Missões e Arquivos. As
>   duas dividem a mesma ilha (.sidebar-island, antes .mission-island).
> - Arquivos.tsx deixou de ser <aside class="lateral"> com botão de fechar e
>   virou conteúdo de página (.arquivos-pagina); quem fecha é a troca de
>   página. As abas internas Arquivos/Memória continuam.
> - O botão Arquivos saiu do rodapé da lateral (o seletor de página o
>   substitui). O editor continua dividindo o palco com os terminais: é ele
>   que precisa de largura, não a árvore.
> - No celular, abrir um arquivo fecha a gaveta, como escolher um agente.
> - CSS morto do painel antigo removido de style.css (.lateral e suas duas
>   media queries); .lateral-corpo continua, é o corpo da página.
> - check-ui e check-edicao passaram a navegar pela página Arquivos; novo
>   screenshot web/ui-arquivos.png mostra árvore + editor + terminais juntos.
>
> PALCO SÓ TERMINAL (6ª atualização, mesmo dia), a pedido do usuário:
>
> - A barra do topo do palco saiu inteira: nome da missão, seletor Um/Todos e
>   as colunas Auto/1/2/3. Nada mais fica em cima dos terminais.
> - A missão aberta mostra TODOS os seus terminais, sempre em grade
>   automática. Escolher um agente na lateral não esconde os outros: leva o
>   cursor para o terminal dele (.pane.selecionado marca qual é).
> - As colunas viraram preferência guardada em localStorage e moraram para os
>   Ajustes, numa aba nova, Tela — são sete abas agora, não seis.
> - "Detalhes da missão" perdeu a casa junto com a barra e foi para o rodapé
>   da lateral, como botão Missão. O mascote do canto também vivia na barra:
>   sumiu, e os mascotes seguem animando no cabeçalho de cada terminal.
> - O botão de abrir a gaveta no celular flutua sobre o palco (só ≤760px).
> - A listra que separava lateral e terminais foi removida (border-right da
>   .sidebar e border-top do rodapé): o mesmo fundo corre pelos dois, e quem
>   dá estrutura é a ilha.
> - A ilha ocupa a lateral inteira e rola por dentro, com uma missão ou com
>   doze; não encolhe para caber no conteúdo.
>
> PENDENTE: etapa 5 (nova missão, arquivos/editor e maestro revistos no sistema
> novo) e etapa 6 (revisão visual, uma a uma, das superfícies auxiliares — hoje
> herdam os tokens neutros). A bateria completa (npm test) não foi executada:
> vários check-* tocam provedores reais. Nenhum agente ou servidor reiniciado.

## 1. Pedido e direção

O usuário gosta do produto atual e quer mudar toda a apresentação: preto, cinza e branco como no seu site vijcoelho.com; interface minimalista inspirada em Grok Bot e BridgeMind; ilhas bonitas; pouca informação inicial; detalhes abertos por clique; possibilidade de uma cor por agente. Pediu também um registro para outra IA continuar quando o contexto acabar.

Proposta: **um espaço de trabalho monocromático com agentes que se expandem por demanda**. O usuário reconhece quem está trabalhando, escolhe um agente e entra no seu trabalho sem perder a missão atual. A expressão visual vem da proporção, do espaço e da identidade de cada agente.

Esta é uma proposta para avaliação, não uma decisão visual aprovada nem autorização para implementar. Foi enviada uma pergunta opcional sobre a entrada preferida: missão + agentes, campo de tarefa ou coleção de agentes. Sem resposta registrada até a elaboração deste documento, a recomendação é missão + agentes. As cores exatas, dimensões e nomes de componentes abaixo são propostas.

## 2. Evidência e limites da pesquisa

- [Grok Bot](https://x.ai/bot): o conteúdo consultado apresenta bots como colegas, atribuição de trabalho, vários bots simultâneos e colaboração. Isso inspira agentes reconhecíveis e acesso individual ao trabalho. Não foi possível verificar a composição visual renderizada.
- [BridgeMind](https://www.bridgemind.ai/#community): a página consultada descreve agentes com identidade própria, painel do agente selecionado, controles de contexto e detalhes de ferramentas recolhidos. Inspira separação entre visão geral e execução. O leitor retornou a página inteira; a seção community não foi inspecionada visualmente.
- [vijcoelho.com](https://vijcoelho.com): tentativas de leitura falharam. A base preto/cinza/branco vem expressamente do usuário; nenhum token ou fonte foi extraído do site.
- O navegador de automação informou que não há navegador disponível. Não houve inspeção visual da aplicação em execução nem screenshots.
- Evidência local: README.md, package.json, web/App.tsx, style.css, Pane.tsx, PaneGrid.tsx, api.ts, socket.ts, Ajustes.tsx e trechos das superfícies auxiliares.
- Skill Impeccable usada para descoberta, hierarquia e planejamento. A pergunta de descoberta continua sem resposta registrada; nenhum PRODUCT.md ou DESIGN.md foi criado como autoridade aprovada.

## 3. Produto que deve continuar funcionando

O Cockpit é uma aplicação web local em React/TypeScript e Vite, com servidor Node/Express, WebSocket, terminais xterm e processos de CLI via PTY. Organiza projetos, missões, agentes e squads; oferece arquivos, editor, memória, consumo, provedores, receitas, skills, mídia e continuidade do maestro.

O redesign cobre essas superfícies. Mantém as capacidades existentes e o vocabulário projeto, missão, agente e maestro. Não implica trocar framework, adicionar um serviço de chat, alterar política de autonomia ou mudar contratos do servidor. Uma conversa estruturada estilo mensageiro exigiria trabalho adicional: hoje a execução apresentada é terminal.

## 4. Leitura da UI atual

Já existe uma boa organização funcional: projetos, arquivos, consumo e ajustes têm pontos de abertura; Ajustes reúne seis áreas. O redesenho deve aproveitar essa estrutura.

A densidade ainda aparece em três pontos:

1. A barra da missão mistura projeto, missão, elenco, branch, objetivo, seleção de agente e tarefa, abertura de painel, colunas e voz.
2. PaneGrid abre os terminais juntos. O cabeçalho de cada Pane inclui identidade, modelo, atividade e custo/tempo.
3. O rodapé reúne cotas, número de painéis, missões, memória, Git, custo e caminho.

O tema atual usa azul neon (#4195ff), neutros azulados, brilho, raio de 7px e tipografia bastante pequena. Trocar apenas --neon não resolve a hierarquia nem todos os valores fixos de terminal/editor.

## 5. Conceito recomendado: missão com ilhas de agentes

### Visão inicial

Três regiões principais: navegação compacta, contexto da missão e ilhas dos agentes ativos. Um único comando principal por estado.

```text
  [Cockpit / Projeto ▾]                           [Atividade] [Ajustes]

  Missão atual ▾                                [+ Adicionar agente]
  Objetivo resumido · Detalhes

  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
  │ ◉ Maestro        │ │ ◉ Agente A       │ │ ◉ Agente B       │
  │ Em execução      │ │ Sem atividade   │ │ Em execução      │
  │ Abrir trabalho → │ │ Abrir trabalho → │ │ Abrir trabalho → │
  └──────────────────┘ └──────────────────┘ └──────────────────┘

  [Arquivos] [Missão]                              [Ver terminais]
```

Esquema de estrutura, não mockup final. Nomes e estados são ilustrativos. Os rótulos finais devem refletir os dados reais e a semântica do detector de atividade.

O Maestro aparece primeiro quando existir. Sem exceções, a home não exibe dashboards de custos, gráficos, modelos, árvore de arquivos ou terminais abertos. Alertas que exigem ação aparecem de forma localizada e persistente enquanto relevantes.

### Ao abrir uma ilha

O centro vira a área de trabalho do agente. Os demais agentes se compactam em uma faixa lateral no desktop. Cabeçalho: identidade, estado e menu de ações. Terminal existente ocupa o espaço principal. Voltar à visão geral recolhe o trabalho e preserva a execução.

Detalhes do agente abrem ao lado: papel, CLI/modelo, esforço, atividade e consumo. Cor e nome continuam iguais entre a visão geral, terminal e seletor. Duas sessões do mesmo agente precisam de rótulo adicional estável para diferenciação.

Uma opção explícita “Ver terminais” mantém a visão simultânea útil para quem acompanha vários CLIs. O seletor de colunas pertence a essa visão. A visão inicial continua compacta ao criar novos agentes.

### Alternativas consideradas

| Entrada | Vantagem | Limitação | Recomendação |
| --- | --- | --- | --- |
| Missão + agentes | Mostra o trabalho existente e dá identidade aos agentes | Precisa administrar bem muitas sessões | Padrão sugerido |
| Campo central de tarefa | Início muito simples | Esconde a atividade e pode sugerir um chat que ainda não existe | Aproveitar na criação de missão |
| Coleção de todos os agentes | Valoriza os personagens e suas cores | Mistura catálogo disponível e trabalho ativo | Usar em Adicionar agente |

## 6. O que aparece e o que abre por clique

| Informação / ação | Entrada visível | Conteúdo após clique |
| --- | --- | --- |
| Projetos e missões | Nome do projeto + seletor da missão | Busca, lista, abrir pasta, criar missão e ações existentes |
| Agentes ativos | Ilhas com identidade e estado resumido | Área de trabalho do agente |
| Adicionar agente | Botão único | Catálogo; escolha de agente; tarefa/modelo/esforço nos detalhes pertinentes |
| Objetivo e squad | Objetivo curto / Missão | Objetivo completo, fases, elenco e avanço de fase |
| Arquivos e memória | Arquivos | Árvore, itens alterados e memória em abas internas |
| Editor | Clique em arquivo | Editor ao lado do agente; preservar salvar/descartar/cancelar |
| Consumo e cotas | Atividade; alerta compacto se necessário | Custos estimados, cotas disponíveis, origem e atualização |
| Git | Detalhes da missão | Branch, worktree, alterações e ações atuais |
| Maestro e continuidade | Menu da missão / identidade do Maestro | Provedor, modelo, limites e troca com contexto |
| Voz | Microfone na área de entrada correspondente | Gravação e preferências de idioma |
| Configurações | Ajustes | Provedores, Grátis, Marketplace, Skills, Receitas, Media |

Detalhes comuns devem ficar a um clique; configurações profundas a no máximo dois níveis. Rótulos essenciais permanecem visíveis: não depender de hover, tooltip ou memorização de ícones. Preferir uma superfície auxiliar por vez, com retorno consistente, evitando modais empilhados.

## 7. Linguagem visual proposta

### Base neutra

| Papel | Valor inicial proposto |
| --- | --- |
| Fundo | #080808 |
| Ilha | #141414 |
| Superfície elevada | #1C1C1C |
| Hover | #242424 |
| Divisor decorativo | #303030 |
| Texto principal | #F5F5F5 |
| Texto secundário | #A3A3A3 |
| Texto auxiliar | #858585 |
| Ação principal | Fundo #F5F5F5, texto #111111 |

Esses valores são candidatos, não amostras das referências. Validar contraste em cada combinação real; bordas decorativas não servem automaticamente como contorno acessível de controle. Foco de teclado deve ter indicador próprio bem visível.

Ilhas com raio inicial de 18–22px, controles com 10–12px, contorno sutil e sombra curta. Distinção por superfícies e espaço. Evitar brilho neon disseminado, excesso de vidro e cartões dentro de cartões. Tipografia de interface com a stack de sistema existente; corpo em torno de 14px, metadados legíveis, título da missão em torno de 24px. Monoespaçada concentrada no terminal, código e medidas técnicas.

Espaçamento em escala de 4/8/12/16/24/32px. A composição deve continuar compacta o suficiente para operar, sem virar uma landing page com um título gigante e espaço vazio ornamental.

### Cor como identidade dos agentes

Usar AgentSpec.cor / PaneState.cor como origem existente. Cores propostas podem ser harmonizadas na camada visual, com identidade determinística por agente, jamais pela posição na lista. Não mudar a cor quando houver troca de provedor do Maestro.

Paleta candidata para identidades: lavanda #B8A1FF, azul #8FB8FF, menta #88D4B0 e pêssego #EDB18A. Atribuições finais dependem do catálogo real; não criar funções fictícias para preencher cores.

A cor ocupa principalmente um avatar geométrico ou monograma. Pode reaparecer num marcador e na seleção. O fundo grande da ilha fica neutro. Na expansão, manter um pequeno ponto de continuidade cromática no cabeçalho. Começar com símbolos vetoriais simples, evitando dependência de geração de imagens.

Separar cor de identidade e cor de estado. Um agente verde não está automaticamente saudável; uma identidade pêssego não significa alerta. Estados têm texto e ícone. Atenção, erro e desconexão usam sinais semânticos próprios.

### Movimento

Hover curto de aproximadamente 120–160ms. Abertura e recolhimento em torno de 180–240ms com opacidade e pequeno deslocamento. A ilha selecionada deve ser reconhecível no cabeçalho expandido. Não animar dimensões do terminal continuamente nem refazer fit a cada frame. Respeitar prefers-reduced-motion; sem pulsações decorativas permanentes.

## 8. Estados e comportamento

- Sem projeto: uma ação “Abrir projeto”.
- Projeto sem missão: uma ação “Nova missão”.
- Missão sem agente: uma ação “Adicionar agente”, destacando Maestro se disponível.
- Um agente: uma ilha com dimensão confortável; não esticar até preencher toda a tela.
- De dois a seis: grade curta e bem espaçada.
- Muitos agentes, inclusive 12+: grade com rolagem, filtro por nome/estado e opção de visão simultânea; nenhum terminal fica ilegível para caber tudo na home.
- Agente sem saída recente: comunicar ausência de atividade, sem afirmar que terminou ou precisa de aprovação.
- Painel encerrado: feedback do encerramento; não prometer histórico persistente de execução que o backend não entregue.
- Desconexão: aviso compacto visível; estado anterior não pode parecer atual; impedir ações de início até reconectar.
- Limite/cota: mostrar alerta baseado em dados reais. Cota desconhecida não é zero nem “tudo bem”.
- Erro e gravação ativa: sinal visível fora da gaveta; atalhos não devem esconder gravação ou perda de conexão.
- Troca de contexto com arquivo editado: manter salvar, descartar e permanecer.
- Abrir/recolher detalhe: clique, Enter e Space; Esc fecha a camada superior compatível; foco retorna ao acionador.
- Na área do terminal, teclas pertencem ao CLI; atalhos globais não podem interceptar Ctrl+C ou comandos comuns.

Não esconder um bloqueio real para manter a home limpa. Ao mesmo tempo, não transformar idle ou silêncio do terminal em uma notificação inventada de “precisa de você”.

## 9. Responsividade

Desktop largo: home com duas ou três colunas de ilhas; agente aberto ocupa a maior região; lista compacta lateral; arquivos/editor podem dividir a área quando pedidos.

Tablet/janela média: uma ou duas colunas, detalhes substituem parte da superfície; reduzir painéis simultâneos antes de comprimir texto.

Mobile web: uma coluna; agente e ajustes em superfícies de tela inteira com voltar explícito; arquivos e editor abrem sequencialmente. Não prometer acesso remoto novo ao servidor local. Alvos de toque confortáveis, idealmente 44px. Garantir rolagem utilizável e testar zoom de 200%.

## 10. Plano técnico e riscos concretos

### Sessão do terminal vem antes da animação

Pane.tsx cria o xterm num useEffect e chama term.dispose() na desmontagem. Trocar diretamente uma ilha por um Pane montado/desmontado a cada clique apagaria o histórico visual já consumido. socket.ts guarda apenas saída recebida sem handler; não é um replay completo e seu buffer atual pode crescer sem limite.

Proposta inicial: separar a sessão visual do terminal da apresentação da ilha e mantê-la estável por paneId enquanto o processo existir. Recolher apenas oculta a superfície, não dispara kill. Ao revelar, executar fit com largura/altura válidas. Para muitos agentes, medir custo das instâncias; virtualizar apenas depois de existir uma estratégia explícita de buffer limitado/replay. Não registrar dois handlers para o mesmo paneId: o mapa de outputs atual aceita um por painel.

O “X” de fechar detalhe e a ação “Encerrar agente” precisam de callbacks e nomes distintos. Hoje onClose de PaneGrid envia kill; não reutilizar esse callback para recolher a ilha.

### Estado de navegação

Preservar a lógica atual de projetos, missões, reconexão e editor em App.tsx. Extrair a apresentação em componentes menores. Modelar visão geral, agente em foco e terminais como estados explícitos; superfície auxiliar separada. Trocar projeto/missão deve validar IDs e limpar seleção visual obsoleta, passando pela proteção de edição pendente.

Nomes candidatos de componentes: MissionOverview, AgentIsland, AgentWorkspace, AgentRail, ContextPanel e AgentPicker. Definir a menor decomposição útil durante a implementação; não criar abstrações sem necessidade.

### Dados disponíveis e promessas proibidas

PaneState oferece identidade, CLI/modelo, status run/idle/dead, tempos e atividade. Não oferece progresso percentual, resumo semântico de tarefa nem um estado confirmado de aprovação pendente. Na primeira versão, usar apenas dados existentes. Novos resumos ou notificações inteligentes exigem contrato separado e revisão do escopo.

### Tema

Introduzir tokens semânticos de fundo, superfície, texto, borda, foco, ação, identidade e estado. Migrar seletores por grupos, evitando acumular overrides ao fim do CSS. Auditar cores fixas em Pane.tsx, tema CodeMirror em Editor.tsx, gráficos de consumo, ícones, modais e foco. Preservar cores ANSI necessárias à leitura de saída de ferramentas.

## 11. Execução por etapas

| Etapa | Entrega | Arquivos principais | Critério de conclusão |
| --- | --- | --- | --- |
| 1. Composição | Home, agente aberto e ajustes representados no mesmo sistema | Mockup ou protótipo separado, conforme próximo pedido | Hierarquia e interação avaliáveis, sem supor funcionalidades novas |
| 2. Fundamentos | Tokens neutros, tipografia, ilhas e controles | web/style.css, Icon.tsx, Modal.tsx | Componentes básicos consistentes e legíveis |
| 3. Navegação principal | Missão resumida e detalhes sob demanda | App.tsx, Workspace.tsx, SquadBar.tsx | Projeto e missão continuam acessíveis; estados vazios completos |
| 4. Agentes | Ilhas, foco individual e visão simultânea | PaneGrid.tsx, Pane.tsx, novos componentes; socket.ts somente se necessário | Recolher preserva processo, saída, scrollback e foco |
| 5. Fluxos operacionais | Nova missão, agente, arquivos/editor e Maestro | NovaMissao.tsx, Arquivos.tsx, Editor.tsx, Maestro.tsx | Configurações avançadas recolhidas; ações e proteção de edição preservadas |
| 6. Superfícies auxiliares | Consumo, cotas e todas as abas de ajustes | Consumo.tsx, Redline.tsx, Ajustes.tsx, Config.tsx, Gratis.tsx, Marketplace.tsx, Skills.tsx, Receitas.tsx, Media.tsx, PoliticaIA.tsx | Sem áreas esquecidas no tema anterior; políticas existentes preservadas |
| 7. Verificação e entrega | Fluxos reais e aparência conferidos | Scripts existentes, documentação final | Critérios abaixo satisfeitos e limitações registradas |

Dependência crítica: validar o ciclo de vida dos terminais antes de ligar as ilhas ao ambiente real. A migração visual pode ser feita por etapas; o backend não precisa de reescrita para viabilizar a proposta básica.

## 12. Critérios de aceitação

1. A home padrão mostra contexto, agentes ativos e ação principal; modelos, esforço, gráficos e terminais aparecem por demanda.
2. Abrir um agente requer um clique; voltar mantém a missão e os demais agentes acessíveis.
3. Recolher e reabrir não inicia outro processo, não envia kill e não perde saída anterior ou recebida enquanto recolhido.
4. Arquivos editados continuam protegidos em todas as trocas de contexto.
5. Projeto, missão, squad, elenco, voz, provedor e continuidade continuam operáveis.
6. Identidades são estáveis; estado não depende só de cor; não há progresso ou notificações fabricados.
7. Todas as áreas secundárias usam o mesmo sistema neutro, incluindo estados vazios, erro, carregamento e indisponível.
8. Teclado, foco, contraste, redução de movimento e telas pequenas são verificados.
9. Conferir home, agente aberto e ajustes em uma rodada visual desktop/mobile; corrigir os problemas encontrados em lote e confirmar.
10. Executar npm run build após implementação. Ler os scripts antes de executá-los; priorizar verificações de UI, edição e continuidade relevantes. Não rodar testes que iniciem provedores pagos ou encerrem sessões reais sem necessidade e escopo explícito.

Testes de maior valor: recolher agente durante saída; alternar agente/projeto/missão; saída volumosa; reconectar; editar arquivo e tentar trocar contexto; encerrar explicitamente agente; catálogo indisponível; 1/6/12 agentes; nome longo; cota desconhecida; navegação por teclado. Atualizar seletores dos checks somente quando o comportamento esperado continuar preservado.

## 13. Continuidade para outra IA

### Estado salvo

- Pesquisa e inventário suficientes para a proposta inicial concluídos.
- Plano registrado neste arquivo; nenhuma mudança em código, configuração, processos, missões ou sessões.
- git status --short estava limpo no início desta etapa.
- Referências consultadas por texto; screenshots e aparência renderizada ainda não validados.
- Preferência opcional da home pendente; manter recomendação identificada como proposta até haver resposta.
- Não há PRODUCT.md / DESIGN.md aprovado. Não confundir este plano com sistema visual já implementado.

### Próxima ação

Ler este arquivo e a eventual resposta do usuário. Se o próximo pedido for implementar ou prototipar, iniciar pela composição de home + agente aberto, carregar as instruções locais aplicáveis e revisar o estado atual do git. Preservar mudanças que tenham surgido desde este checkpoint. Antes de integrar navegação, resolver a preservação de sessão descrita na seção 10.

Não reiniciar o servidor, encerrar painéis, instalar dependências ou alterar a política de agentes apenas para continuar o planejamento. Não copiar os exemplos de estados e nomes do wireframe como dados reais.

### Como atualizar o checkpoint

Ao concluir cada etapa, atualizar este documento com: etapa concluída; arquivos alterados; decisões aceitas; verificações realizadas e resultado; problema pendente; próximo passo exato. Se o contexto estiver ficando curto, salvar antes de iniciar outra etapa grande. Não presumir acesso a um contador exato de tokens restantes.

Pedido sugerido para retomada: “Leia PLANO-REDESIGN-UI.md e continue a partir do estado salvo, considerando minhas respostas posteriores. Preserve o funcionamento dos agentes e registre o próximo checkpoint.”
