# Cockpit — análise e melhorias

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

1. **Preservar edições pendentes:** atualmente trocar arquivo, missão ou projeto e fechar o editor pode descartar alterações não salvas. Centralizar essas transições com opções de salvar, descartar ou cancelar.
2. **Recuperar sessões:** o socket atual não reconecta automaticamente. Implementar reconexão com recuperação de estado e política explícita para comandos pendentes, evitando repetir input ou iniciar agentes duplicados.
3. **Tratar falhas de carregamento:** algumas consultas iniciais e atualizações não capturam rejeições. Exibir erro recuperável em vez de deixar uma área vazia quando a API falha.
4. **Acompanhar entregas:** consolidar objetivo, fase, arquivos alterados e resultado da missão numa visão de revisão. A interface atual já tem os elementos fundamentais, mas falta reunir o resultado final para aprovação.
5. **Validar integração real:** testar squads, CLIs, worktrees, retomada de sessões e consumo com um projeto descartável antes de depender do cockpit em projetos importantes.

## Validação desta entrega

- `npm run build`: passou; Vite ainda avisa sobre chunks acima de 500 KB.
- `npx tsc --noEmit`: passou.
- `scripts/check-ui.mjs`: teste em Chromium com build de produção e API/WebSocket simulados. Verifica entrada, navegação, busca de missões, colunas dos terminais, desconexão e largura de celular, sem erros de página.
- Capturas revisadas: `web/ui-desktop.png`, `web/ui-workspace.png`, `web/ui-mobile.png`.
- Não foram iniciados agentes reais nem alterados projetos pessoais durante os testes.

Para repetir o teste de interface, instale Playwright no ambiente de testes ou forneça um caminho existente: `node scripts/check-ui.mjs <caminho-para-playwright-core/index.mjs>`.
