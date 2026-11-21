import assert from 'node:assert/strict';
import {launch,identify,publish,SessionError,findPublishedPost} from './src/threads.js';
const browser=await launch();
let seen=0;
const wrap={
 async newContext(options){
  const ctx=await browser.newContext(options);
  await ctx.route('https://www.threads.com/**',route=>route.fulfill({contentType:'text/html',body:`<nav><a href="/@teste">Profile</a></nav><div role="button" aria-label="Novo post" hidden id="opener" onclick="document.querySelector('dialog').showModal()">+</div><dialog><div contenteditable="true" aria-label="Campo de texto vazio. Digite para compor um novo post."></div><button onclick="document.querySelector('dialog').close();document.querySelector('output').textContent='Seu thread foi publicado'">Postar</button></dialog><output></output><script>setTimeout(()=>document.querySelector('#opener').hidden=false,13000)</script>`}));
  return ctx;
 }
};
try{
 const state={cookies:[],origins:[]};
 const started=Date.now();
 const stages=[];
 const outcome=await publish(wrap,{handle:'@teste',state},{text:'Publicação simulada'},null,async()=>{seen++;},async stage=>stages.push(stage));
 assert.ok(Date.now()-started>=13000);
 assert.equal(outcome.status,'publicado');
 assert.equal(seen,1);
 assert.deepEqual(stages,['Carregando o Threads','Verificando a conta','Abrindo o editor','Preparando o envio','Aguardando confirmação do Threads']);
 await assert.rejects(publish(wrap,{handle:'@outra',state},{text:'teste'},null,async()=>{seen++;}),SessionError);
 assert.equal(seen,1);
 const ctx=await wrap.newContext();const page=await ctx.newPage();
 await page.goto('https://www.threads.com/');
 assert.equal((await identify(page)).handle,'@teste');
 await ctx.close();
 let sentAt;
 let profileReads=0;
 const profileOnly={
  async newContext(options){
   const context=await browser.newContext(options);
   await context.route('https://www.threads.com/**',route=>{
    if(new URL(route.request().url()).pathname==='/@teste'){
     profileReads++;
     return route.fulfill({contentType:'text/html; charset=utf-8',body:`<div><div><span>Publicação simulada</span><a href="/@teste/post/novo"></a></div><a href="/@teste/post/novo"><time datetime="${new Date(sentAt).toISOString()}">agora</time></a></div>`});
    }
    return route.fulfill({contentType:'text/html',body:`<nav><a href="/@teste">Profile</a></nav><button onclick="document.querySelector('dialog').showModal()">Novo post</button><dialog><div contenteditable="true" style="min-height:24px"></div><button onclick="document.querySelector('dialog').close()">Postar</button></dialog>`});
   });
   return context;
  }
 };
 const verified=await publish(profileOnly,{handle:'@teste',state},{text:'Publicação simulada'},null,async()=>{sentAt=Date.now();});
 assert.equal(verified.status,'publicado');
 assert.equal(verified.url,'https://www.threads.com/@teste/post/novo');
 assert.equal(profileReads,1);
 assert.ok(Date.now()-sentAt<10000);
 const profileContext=await profileOnly.newContext();
 const profilePage=await profileContext.newPage();
 await profilePage.goto('https://www.threads.com/@teste');
 assert.equal(await findPublishedPost(profilePage,'@teste','Publicação simulada',sentAt+60000),null);
 await profileContext.close();
 console.log('Edge: navegador do Windows, confirmação de perfil e envio simulado, bloqueio de conta errada.');
}finally{await browser.close();}
