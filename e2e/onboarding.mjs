import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${process.env.E2E_BASE_URL??'http://127.0.0.1:3110'}/onboarding?mode=demo`);
  await page.getByText(/Demonstração simulada • dados somente nesta sessão/).waitFor();
  await page.getByLabel('Nome da empresa').fill('Piloto simulado');
  await page.getByRole('button',{name:'Continuar',exact:true}).click();
  await page.getByLabel('Perguntas e respostas aprováveis').fill('Q: Horário?\nA: Das 9h às 18h.');
  await page.getByLabel('Regras de atendimento e transferência').fill('Transferir perguntas desconhecidas para humano.');
  await page.getByRole('button',{name:'Continuar',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Aprovar conteúdo e autorizar agente'}).isEnabled(),false);
  await page.getByRole('button',{name:'Salvar revisão'}).click();
  await page.getByRole('button',{name:'Aprovar conteúdo e autorizar agente'}).click();
  await page.getByText('Aprovação simulada. Nenhum agente real foi ativado.').waitFor();
  await page.getByRole('button',{name:'Continuar',exact:true}).click();
  await page.getByRole('button',{name:'Testar com adaptador simulado'}).click();
  await page.getByText(/Teste simulado: conteúdo fornecido disponível/).waitFor();
  await page.getByRole('button',{name:'Conectar Instagram oficial'}).click();
  await page.getByText('Conexão simulada: permissões pendentes. Nenhum OAuth real iniciado.').waitFor();
  await page.getByRole('button',{name:'2. Conhecimento e regras'}).click();
  await page.getByLabel('Perguntas e respostas aprováveis').fill('Q: Horário?\nA: Das 10h às 18h.');
  await page.getByRole('button',{name:'3. Revisão e aprovação'}).click();
  assert.equal(await page.getByRole('button',{name:'Aprovar conteúdo e autorizar agente'}).isEnabled(),false);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);
  console.log(`PASS onboarding E2E ${width}px: supplied content, save-before-approval, simulated test, pending connection, edit revokes approval, no overflow/errors`);
  await context.close();
 }
}finally{await browser.close();}
