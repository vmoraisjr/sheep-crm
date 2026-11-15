import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox'] });
const baseURL=process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3105';
try {
 for (const width of [390,1440]) {
  const context=await browser.newContext({viewport:{width,height:1000}});const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${baseURL}/demo`);await page.getByRole('heading',{name:'Central de Conversas',exact:true}).waitFor();
  await page.getByRole('button',{name:'Instagram',exact:true}).click();
  await page.getByRole('button',{name:/João Santos/}).waitFor();
  assert.equal(await page.getByRole('button',{name:/Marina Oliveira/}).count(),0);
  await page.getByRole('button',{name:'Todas',exact:true}).click();
  await page.getByRole('button',{name:/Marina Oliveira/}).click();
  await page.getByLabel('Resposta manual').fill('Resposta simulada do teste integrado');
  await page.getByRole('button',{name:'Simular envio'}).click();
  await page.getByRole('log').getByText('Resposta simulada do teste integrado').waitFor();
  assert.equal(await page.getByRole('button',{name:'IA pausada',exact:true}).getAttribute('aria-pressed'),'false');
  if(width===390)await page.getByRole('button',{name:'← Caixa de entrada',exact:true}).click();
  await page.getByRole('button',{name:'Não respondidos',exact:true}).click();assert.equal(await page.getByRole('button',{name:/Marina Oliveira/}).count(),0);
  await page.getByRole('button',{name:'Todas',exact:true}).click();
  await page.getByLabel('Buscar conversas').fill('inexistente');await page.getByText('Nenhuma conversa encontrada.').waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),`Inbox overflow at ${width}`);
  await page.getByRole('link',{name:/Negócios/}).click();await page.getByRole('heading',{name:'Funil de Negócios',exact:true}).waitFor();
  await page.getByRole('button',{name:'Loja Aurora',exact:true}).click();await page.getByLabel('Etapa de Loja Aurora').selectOption('won');await page.getByRole('button',{name:'Fechar detalhes'}).click();
  await page.getByRole('link',{name:/Visão geral/}).click();await page.getByRole('heading',{name:/Bom dia, Ana|Olá, Ana/}).waitFor();

  await page.getByText('27%',{exact:true}).waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),`Dashboard overflow at ${width}`);
  await page.getByRole('link',{name:/Conversas/}).click();await page.getByRole('button',{name:/Marina Oliveira/}).click();if(width===390)await page.getByRole('button',{name:'Detalhes do contato',exact:true}).click();await page.getByText('Ganho',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  console.log(`PASS demo E2E ${width}px: channel filters, search/empty, manual reply, human pause, unanswered, CRM win, dashboard 27%, no page errors/overflow`);
  await context.close();
 }
} finally { await browser.close(); }
