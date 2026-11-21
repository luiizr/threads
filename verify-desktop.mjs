import assert from 'node:assert/strict';
import {mkdtemp,cp,mkdir,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {_electron as electron} from 'playwright-core';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const profile=await mkdtemp(resolve('redis-test-profile-'));
const runtime=join(profile,'redis','runtime');
const bundle='Redis-8.2.10-Windows-x64-msys2';
if(!process.argv.includes('--download')){
 await mkdir(runtime,{recursive:true});
 await cp(resolve('redis-test',bundle),join(runtime,bundle),{recursive:true});
}
const packaged=process.argv.includes('--packaged');
const options={executablePath:packaged?resolve('versao-015/win-unpacked/ThreadFlow.exe'):require('electron'),
 args:[...(packaged?[]:['.']),'--user-data-dir='+profile,'--minimized']};
let app=await electron.launch(options);
try{
 const actual=await app.evaluate(({app})=>app.getPath('userData'));
 assert.equal(resolve(actual),resolve(profile));
 const page=await app.firstWindow();
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.getByRole('heading',{name:'Bem-vindo ao ThreadFlow'}).waitFor();
 await page.getByRole('status').filter({hasText:'Redis conectado'}).waitFor({timeout:110000});
 const inspect=async()=>{
   assert.doesNotMatch(await page.locator('body').innerText(),/graph api|oauth|api oficial/i);
   assert.equal(await page.locator('img:not([src]),img[src=""]').count(),0);
 };
 await inspect();
 const name=page.locator('#username-input');
 await name.fill('Nome de Teste');
 assert.equal(await page.locator('#avatar-name-caption').textContent(),'Nome de Teste');
 assert.equal(await name.evaluate(input=>{
   const icon=input.parentElement.querySelector('.tf-name-icon');
   return !!icon&&input.getBoundingClientRect().left+parseFloat(getComputedStyle(input).paddingLeft)>icon.getBoundingClientRect().right+6;
 }),true);
 await page.getByRole('button',{name:/continuar para conexão/i}).click();
 await page.waitForURL('**/accounts.html#connect');
 await page.getByRole('dialog').getByRole('heading',{name:'Conectar conta do Threads'}).waitFor();
 assert.equal((await page.evaluate(()=>window.threadflow.invoke('snapshot'))).profileName,'Nome de Teste');
 await page.getByRole('dialog').getByRole('button',{name:'Cancelar',exact:true}).click();
 for(const [label,file] of [['Métricas','overview'],['Contas','accounts'],['Publicações','posts'],['Logs','logs'],['Configurações','settings']]){
   await page.getByRole('link',{name:label,exact:true}).click();
   await page.waitForURL('**/'+file+'.html');
   await page.locator('body.tf-ready').waitFor();
   assert.equal(await page.getByText(/Falha ao abrir a tela/).count(),0);
   await inspect();
 }
 await page.getByText('Redis conectado',{exact:true}).waitFor({timeout:15000});
 const state=await page.evaluate(()=>window.threadflow.invoke('snapshot'));
 assert.ok(state.redisReady);
 assert.deepEqual(state.accounts,[]);
 assert.deepEqual(state.jobs,[]);
 await page.getByRole('link',{name:'Publicações',exact:true}).click();
 await page.getByText('Nenhuma publicação para os filtros escolhidos.',{exact:true}).waitFor();
 await page.getByRole('button',{name:/nova publicação/i}).first().click();
 await page.getByRole('dialog').getByText('Conecte uma conta antes de publicar.').waitFor();
 assert.deepEqual(errors,[]);
 const alive=await app.evaluate(({BrowserWindow})=>{
   const window=BrowserWindow.getAllWindows()[0];window.close();
   return !window.isDestroyed()&&!window.isVisible();
 });
 assert.ok(alive);
 await app.evaluate(({app,safeStorage})=>{
   const fs=process.getBuiltinModule('fs');
   const path=process.getBuiltinModule('path');
   const file=path.join(app.getPath('userData'),'workspace.bin');
   const state=JSON.parse(safeStorage.decryptString(fs.readFileSync(file)));
   state.welcome=false;
   state.accounts=[{id:'fixture-1',handle:'@primeira.teste',name:'Primeira conta'},{id:'fixture-2',handle:'@segunda.teste',pending:true}];
   fs.writeFileSync(file,safeStorage.encryptString(JSON.stringify(state)));
 });
 await app.close();
 app=await electron.launch(options);
 const overview=await app.firstWindow();
 await overview.getByRole('heading',{name:'Visão geral'}).waitFor();
 const accounts=overview.getByRole('combobox',{name:'Conta na tela atual'});
 await accounts.locator('option').filter({hasText:'Todas as contas (2)'}).waitFor({state:'attached'});
 assert.equal(await accounts.locator('option').count(),3);
 await accounts.selectOption('fixture-1');
 assert.equal(await overview.getByText('@primeira.teste · Sessão salva',{exact:true}).count(),1);
 assert.equal(await overview.getByText('@segunda.teste · Reconectar',{exact:true}).count(),0);
 console.log('Electron: Redis instalado e iniciado automaticamente, seis telas, estado real vazio, formulário e fechamento mantendo o processo na bandeja.');
}finally{await app.close();await rm(profile,{recursive:true,maxRetries:5,retryDelay:300});}
