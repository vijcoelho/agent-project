# Cockpit

Cockpit é uma interface local para trabalhar com agentes de IA no mesmo projeto. Ele abre painéis para Claude Code, Codex, Antigravity e outros CLIs, organiza missões, pode criar worktrees Git e mantém o contexto do trabalho entre painéis.

O Cockpit não traz nem paga modelos de IA. Cada pessoa conecta os CLIs e as contas que já usa.

## Rodar depois de clonar

Requisitos validados neste projeto:

- Windows 10 ou 11
- Node.js 24 (use uma versão recente do Node; o servidor executa arquivos TypeScript diretamente)
- npm, instalado junto com o Node
- Git, recomendado para abrir projetos com branches e worktrees isolados

No PowerShell ou Terminal, dentro da pasta clonada:

```powershell
git clone <URL_DO_REPOSITORIO>
cd agent-project
npm ci
npm start
```

Abra [http://localhost:3000](http://localhost:3000).

`npm ci` instala exatamente as versões guardadas no `package-lock.json`. `npm install` também funciona quando você quiser atualizar ou alterar dependências.

O comando `npm start` primeiro gera a interface e depois inicia o servidor. Para iniciar somente o servidor depois de já ter compilado, use `npm run server`.

> O repositório inclui `node-pty`, que é um módulo nativo. Em uma versão de Node muito nova ou incomum, o npm pode pedir ferramentas de compilação C++. Use a versão LTS/atual do Node; se o problema persistir no Windows, instale o **Visual Studio Build Tools** com a carga **Desktop development with C++** e execute `npm ci` novamente.

## Conectar uma IA

Instale e autentique ao menos um provedor. O Cockpit detecta os comandos no `PATH` e não guarda suas chaves ou sessões: o login continua sendo feito pelo CLI oficial de cada serviço.

| Provedor | Instalar | Primeiro login |
| --- | --- | --- |
| Codex / GPT | `npm i -g @openai/codex` | Execute `codex` e siga o login | 
| Claude Code | `npm i -g @anthropic-ai/claude-code` | Execute `claude` e siga o login |
| Antigravity / Gemini | Instale a Antigravity CLI | Execute `agy models` para conferir a conta |
| Gemini CLI | `npm i -g @google/gemini-cli` | Execute `gemini` e siga o login |

Feche e abra o Cockpit, ou entre em **Ajustes → Provedores** e atualize a lista. Um provedor que não está instalado aparece como indisponível, sem impedir o resto da aplicação de abrir.

Para usar o terminal interno, instale também o Git for Windows. Caso ele não esteja em `C:\Program Files\Git\bin\bash.exe`, abra `cockpit.json` e ajuste `clis.bash.command` para o caminho correto, ou remova esse provedor.

## Primeiro uso

1. Abra o Cockpit em `http://localhost:3000`.
2. Clique em **Abrir projeto** e escolha a pasta em que você quer trabalhar.
3. Clique em **Nova missão**, descreva o objetivo e escolha o modo:
   - **Livre:** você abre os painéis que quiser.
   - **Squad:** o Cockpit abre os agentes previstos nas fases do time.
   - **Agêntico:** abre o maestro, que acompanha e delega o trabalho.
4. Acompanhe os painéis no centro da tela. Eles executam comandos reais no projeto selecionado.

Em projetos Git, a missão pode usar um worktree separado. Isso cria uma branch de trabalho para evitar que uma missão altere diretamente a branch atual.

## Escolher quem executa

Em **Maestro → Quem faz o trabalho**, há três formas de operar:

- **Padrão atual:** usa os papéis e modelos definidos em `cockpit.json` e os tipos de tarefa.
- **Uma IA para tudo:** escolha, por exemplo, `gpt-5.6-sol`; ela assume maestro, piloto, builder e revisão. O maestro passa a poder implementar diretamente.
- **Escolher por papel:** fixa um provedor, modelo e esforço para papéis específicos, deixando o restante seguir o padrão.

A configuração vale para painéis abertos depois de salvar. Um painel já em execução preserva a configuração com que foi iniciado.

## Configuração e dados locais

`cockpit.json` é a configuração compartilhável do Cockpit: agentes, modelos, times, receitas e porta. O Cockpit grava alterações feitas nas telas nesse arquivo.

O estado pessoal fica fora do repositório, em `~/.cockpit` (ou no caminho definido por `COCKPIT_HOME`). Ali ficam os projetos abertos, missões, notas e a continuidade. Essa pasta já está no `.gitignore`.

Se você quiser recomeçar com uma lista vazia de projetos e missões, feche o Cockpit e apague somente `~/.cockpit`. Isso não apaga os projetos originais nem worktrees que já tenham sido criados.

## Comandos úteis

```powershell
# Conferir tipos antes de enviar mudanças
npx tsc --noEmit

# Gerar a versão de produção da interface
npm run build

# Iniciar o Cockpit (compila e sobe o servidor)
npm start
```

## Limites conhecidos

O seletor gráfico de pastas foi feito para Windows. Em outros sistemas, o servidor e os CLIs podem funcionar, mas é necessário informar/abrir os projetos por um fluxo compatível ou adaptar esse seletor. Recursos de mídia dependem do provedor que cada pessoa configurar.
