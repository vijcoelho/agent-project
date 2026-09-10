// Usage: node scripts/check-ui.mjs <path-to-playwright-core/index.mjs>
// Serves the production build with isolated fixtures; never starts agent CLIs.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const { chromium } = await import(process.argv[2] ? pathToFileURL(resolve(process.argv[2])).href : 'playwright');
const root = resolve('web/dist');
const server = createServer(async (req, res) => {
  try {
    const file = resolve(root, '.' + (req.url === '/' ? '/index.html' : req.url));
    if (!file.startsWith(root + '\\') && !file.startsWith(root + '/')) throw Error('Invalid path');
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' })[extname(file)] ?? 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
// CHROME_PATH permite reaproveitar um Chromium ja baixado quando a versao do
// playwright-core disponivel nao bate com a dos navegadores instalados.
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let projects = [], missions = [], panes = [];
  let holdTree = false;
  const lateTrees = [];
  let maestroSettings = { agent: { label: 'MAESTRO', cli: 'codex', model: 'gpt-6-astra', effort: 'high' }, auto: true, limits: {}, providers: [{ id: 'codex', disponivel: true, modelos: ['gpt-6-astra'] }, { id: 'claude', disponivel: true, modelos: ['opus'] }, { id: 'agy', disponivel: true, modelos: ['gemini-3.1-pro-high'] }] };
  const politicaIA = { politica: { modo: 'padrao' }, agents: { maestro: { label: 'Maestro', cor: '#4195ff', cli: 'codex', model: 'gpt-6-astra' }, piloto: { label: 'Piloto', cor: '#4195ff', cli: 'claude', model: 'opus' }, builder: { label: 'Builder', cor: '#4195ff', cli: 'claude', model: 'sonnet' } }, providers: [{ id: 'codex', comando: 'codex', disponivel: true, caminho: 'C:/codex.exe', modelos: ['gpt-6-astra'], efforts: ['low', 'high'], agentes: ['maestro'] }] };
  const pontes = [{ id: 'openrouter', label: 'OpenRouter', base: 'codex', baseDisponivel: true, baseUrl: 'https://openrouter.ai/api/v1', chaveEnv: 'OPENROUTER_API_KEY', chaveEm: null, pronto: false, falta: 'falta a chave (OPENROUTER_API_KEY)', chaveUrl: 'https://openrouter.ai/settings/keys', modelos: [{ id: 'livre/modelo', nome: 'Livre', contexto: 200000, ferramentas: true, gratis: true }, { id: 'livre/conversa', nome: 'Conversa', contexto: 8000, ferramentas: false, gratis: true }], modelo: 'livre/modelo', agentes: ['gratis'], catalogoEm: Date.now(), nota: null }];
  const usage = { in: 0, out: 0, cacheWrite: 0, cacheRead: 0, custo: 0, turnos: 0, model: null };
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/tree' && holdTree) { lateTrees.push(route); return; }
    if (path.startsWith('/api/projects/') && route.request().method() === 'DELETE') { projects = []; return route.fulfill({ json: { ok: true } }); }
    if (path === '/api/maestro' && route.request().method() === 'POST') { const body = route.request().postDataJSON(); maestroSettings = { ...maestroSettings, agent: { ...maestroSettings.agent, cli: body.cli, model: body.model, effort: body.effort }, auto: body.auto }; return route.fulfill({ json: maestroSettings }); }
    if (path === '/api/maestro' || path === '/api/maestro/refresh') return route.fulfill({ json: maestroSettings });
    if (path === '/api/politica-ia') return route.fulfill({ json: politicaIA });
    if (path.startsWith('/api/pontes')) return route.fulfill({ json: route.request().method() === 'POST' ? { ok: true } : { pontes } });
    const data = path === '/api/config' ? { agents: { maestro: { label: 'Maestro', cli: 'claude', cor: '#4195ff' } }, squads: {}, tarefas: {}, providers: [] }
      : path === '/api/projects' ? { projects } : path === '/api/missions' ? { missions }
      : path === '/api/providers' ? { providers: [], presets: [] }
      : path === '/api/consumo' ? { claude: { total: usage, porModelo: [], porDia: [], sessoes: 0, desde: null }, agy: { conversas: 0, pedidos: 0, ultima: null } }
      : path === '/api/skills' ? { skills: [{ nome: 'exemplo', descricao: 'skill de teste', papeis: [], caminho: 'C:/x/SKILL.md', origem: 'cockpit', editavel: true, tamanho: 10 }], acervo: { total: 1, porOrigem: { cockpit: 1 } } }
      : path === '/api/receitas' ? { receitas: { teste: { label: 'Teste', descricao: 'uma receita', modo: 'livre', daCasa: true } } }
      : path === '/api/marketplace' ? { fontes: [{ id: 'oficial', url: null, origem: 'claude', plugins: 1, caminho: 'C:/x' }], plugins: [{ id: 'oficial/exemplo', nome: 'exemplo', descricao: 'plugin de teste', categoria: 'design', marketplace: 'oficial', skills: [], mcps: [], local: true, remoto: null, homepage: null }] }
      : path === '/api/media' ? { provedores: [{ id: 'gemini-image', label: 'Gemini', faz: ['image'], via: 'http', pronto: false, falta: 'falta a chave', chaveEm: null, modelos: ['m1'], modelo: 'm1', instalar: null, nota: null }] }
      : path === '/api/panes' ? { panes } : path === '/api/file' ? { content: 'export const test = true;' } : path === '/api/tree' ? { tree: projects.length ? [{ nome: 'exemplo.ts', caminho: 'exemplo.ts', dir: false }] : [] } : [];
    return route.fulfill({ json: data });
  });
  let socket;
  await page.routeWebSocket('**/ws', ws => { socket = ws; });
  const url = `http://127.0.0.1:${server.address().port}`;
  await page.goto(url);
  await page.getByRole('button', { name: 'Abrir projeto', exact: true }).waitFor();
  await page.screenshot({ path: 'web/ui-desktop.png', fullPage: true });
  assert.equal(await page.locator('.lateral').count(), 0, 'a lateral nao aparece sem projeto');
  assert.equal(await page.getByRole('button', { name: 'Abrir projeto', exact: true }).count(), 1, 'so um botao diz Abrir projeto');
  projects = [{ id: 'p1', nome: 'Meu projeto', root: 'C:/projetos/exemplo', git: true }];
  missions = [{ id: 'm1', projectId: 'p1', nome: 'Interface do cockpit', objetivo: 'Refinar a experiência', branch: 'missao/interface', git: { dirty: 0, head: 'abc123' }, usage, panes: [], squad: null }];
  await page.reload();
  await page.getByRole('heading', { name: 'Traga o primeiro agente.' }).waitFor();
  // Projetos e missões moram numa janela, aberta pelo botão do projeto.
  await page.getByTitle('Projetos e missões', { exact: true }).click();
  await page.getByRole('dialog', { name: 'Projetos e missões', exact: true }).waitFor();
  assert.equal(await page.locator('.linha-toque').count(), 2, 'um projeto e uma missão na janela');
  await page.getByRole('button', { name: 'Fechar projetos', exact: true }).click();
  assert.equal(await page.getByRole('dialog').count(), 0);
  // Arquivos e memória: painel que abre e fecha.
  await page.getByRole('button', { name: 'Arquivos e memória', exact: true }).click();
  await page.locator('.lateral').waitFor();
  await page.getByRole('tab', { name: /Memória/ }).click();
  await page.getByRole('button', { name: 'Fechar arquivos', exact: true }).click();
  assert.equal(await page.locator('.lateral').count(), 0);
  panes = [1, 2, 3].map(n => ({ paneId: `pane${n}`, agent: 'maestro', label: 'Maestro', cor: '#4195ff', missionId: 'm1', status: 'idle', atividade: [], iniciadoEm: Date.now(), usage }));
  await page.reload();
  await page.locator('.pane').first().waitFor();
  const colunas = page.getByRole('group', { name: 'Colunas dos terminais' });
  await colunas.getByRole('button', { name: '1', exact: true }).click();
  assert.equal(await page.locator('.panes').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), 1);
  await colunas.getByRole('button', { name: '2', exact: true }).click();
  assert.equal(await page.locator('.panes').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), 2);
  // Três painéis em duas colunas: o terceiro estica e não sobra buraco preto.
  const larguras = await page.locator('.pane').evaluateAll(els => els.map(el => Math.round(el.getBoundingClientRect().width)));
  assert.ok(larguras[2] >= larguras[0] + larguras[1] - 2, `terceiro painel nao esticou: ${larguras}`);
  await page.screenshot({ path: 'web/ui-workspace.png', fullPage: true });
  const paneBounds = await page.locator('.pane').first().boundingBox();
  await page.getByRole('button', { name: 'Consumo', exact: true }).click();
  await page.getByRole('dialog', { name: 'Consumo', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Claude', exact: true }).waitFor();
  assert.deepEqual(await page.locator('.pane').first().boundingBox(), paneBounds);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.querySelector('dialog').contains(document.activeElement)), true);
  await page.screenshot({ path: 'web/ui-modal.png' });
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Consumo', exact: true }).evaluate(el => el === document.activeElement), true);
  await page.getByRole('button', { name: 'Configurações', exact: true }).click();
  await page.getByRole('dialog', { name: 'Ajustes', exact: true }).waitFor();
  // As seis abas dos ajustes existem e trocam de conteúdo.
  for (const aba of ['Grátis', 'Marketplace', 'Skills', 'Receitas', 'Media']) await page.getByRole('tab', { name: aba }).click();
  assert.equal(await page.getByRole('tab', { name: 'Media' }).getAttribute('aria-selected'), 'true');
  // Grátis: a ponte sem chave diz o que falta, e o modelo sem ferramentas
  // aparece desabilitado — clicar nele abriria um painel que não trabalha.
  await page.getByRole('tab', { name: 'Grátis' }).click();
  await page.getByText('falta a chave (OPENROUTER_API_KEY)').waitFor();
  assert.equal(await page.getByRole('button', { name: /livre\/modelo/ }).isDisabled(), false);
  assert.equal(await page.getByRole('button', { name: /livre\/conversa/ }).count(), 0, 'quem nao roda agente fica escondido por padrao');
  await page.getByRole('button', { name: /sem ferramentas$/ }).click();
  assert.equal(await page.getByRole('button', { name: /livre\/conversa/ }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Testar de verdade', exact: true }).isDisabled(), true, 'sem chave não há o que testar');
  await page.screenshot({ path: 'web/ui-gratis.png' });
  // Regressão: um servidor mais antigo que a tela devolve a página 404 do
  // Express, e a tela dizia "Unexpected token '<'". Agora diz o que fazer.
  await page.route('**/api/pontes', route => route.fulfill({ status: 404, contentType: 'text/html', body: '<!DOCTYPE html><body>Cannot GET</body>' }));
  await page.getByRole('tab', { name: 'Provedores' }).click();
  await page.getByRole('tab', { name: 'Grátis' }).click();
  await page.getByText(/servidor do cockpit está desatualizado/).waitFor();
  assert.equal(await page.locator('.tombo').count(), 0);
  await page.unroute('**/api/pontes');
  await page.getByRole('button', { name: 'Fechar ajustes', exact: true }).click();
  await page.getByTitle('Projetos e missões', { exact: true }).click();
  await page.getByRole('button', { name: 'Nova missão', exact: true }).click();
  await page.getByRole('dialog', { name: 'Nova missão', exact: true }).waitFor();
  assert.deepEqual(await page.locator('.pane').first().boundingBox(), paneBounds);
  await page.getByRole('button', { name: 'Fechar nova missão', exact: true }).click();
  await page.getByRole('button', { name: 'Maestro', exact: true }).click();
  await page.getByRole('dialog', { name: 'Maestro e continuidade' }).waitFor();
  await page.getByRole('button', { name: 'Claude Cota não informada', exact: true }).click();
  await page.getByRole('button', { name: 'Salvar padrão', exact: true }).click();
  await page.getByText('Preferência salva para os próximos maestros.').waitFor();
  assert.equal(maestroSettings.agent.cli, 'claude');
  // Regressão: uma resposta fora do formato nesta rota derrubava o cockpit
  // inteiro para a página de "a tela quebrou". Agora é um aviso local.
  await page.getByRole('button', { name: 'Fechar maestro', exact: true }).click();
  await page.route('**/api/politica-ia', route => route.fulfill({ json: [] }));
  await page.getByRole('button', { name: 'Maestro', exact: true }).click();
  await page.getByRole('dialog', { name: 'Maestro e continuidade' }).waitFor();
  await page.getByText(/formato que esta tela não entende/).waitFor();
  assert.equal(await page.locator('.tombo').count(), 0, 'formato inesperado não pode derrubar o aplicativo');
  await page.getByRole('button', { name: 'Fechar maestro', exact: true }).click();
  await page.unroute('**/api/politica-ia');
  // A árvore vive no painel lateral, que agora se abre sob demanda.
  await page.getByRole('button', { name: 'Arquivos e memória', exact: true }).click();
  await page.getByRole('button', { name: 'exemplo.ts', exact: true }).click();
  await page.locator('.editor-host').waitFor();
  holdTree = true;
  socket.send(JSON.stringify({ type: 'fs-change', path: 'exemplo.ts', base: 'C:/projetos/exemplo' }));
  await page.waitForRequest('**/api/tree?**');
  await page.getByTitle('Projetos e missões', { exact: true }).click();
  await page.getByTitle('Fechar projeto no cockpit', { exact: true }).click();
  await page.getByRole('button', { name: 'fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir projeto', exact: true }).waitFor();
  for (const route of lateTrees) await route.fulfill({ json: { tree: [{ nome: 'arquivo-antigo.ts', caminho: 'arquivo-antigo.ts', dir: false }] } });
  holdTree = false;
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.fnode').count(), 0);
  assert.equal(await page.locator('.editor').count(), 0);
  await socket.close();
  await page.getByRole('button', { name: 'Recarregar', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Abrir painel', exact: true }).count(), 0);
  projects = []; missions = []; panes = [];
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByRole('button', { name: 'Abrir projeto', exact: true }).waitFor();
  assert.equal(await page.locator('.lateral').count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: 'web/ui-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS: welcome, navigation, search, terminal layouts, modals, maestro selection, free-model bridge tab, malformed payload recovery, closing project with delayed tree response, disconnection, mobile; no page errors.');
} finally { await browser.close(); server.close(); }
