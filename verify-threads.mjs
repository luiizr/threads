import assert from 'node:assert/strict';
import {launch,identify,publish,SessionError} from './src/threads.js';
const browser=await launch();
let seen=0;
const wrap={
 async newContext(options){
  const ctx=await browser.newContext(options);
  await ctx.route('https://www.threads.com/**',route=>route.fulfill({contentType:'text/html',body:`<nav><a href="/@teste">Profile</a></nav><button hidden id="opener" onclick="document.querySelector('dialog').showModal()">Create</button><dialog><div contenteditable="true"></div><button onclick="document.querySelector('dialog').close();document.querySelector('output').textContent='Posted'">Post</button></dialog><output></output><script>setTimeout(()=>document.querySelector('#opener').hidden=false,13000)</script>`}));
  return ctx;
 }
};
try{
 const state={cookies:[],origins:[]};
 const started=Date.now();
 const outcome=await publish(wrap,{handle:'@teste',state},{text:'Publicação simulada'},null,async()=>{seen++;});
 assert.ok(Date.now()-started>=13000);
 assert.equal(outcome.status,'publicado');
 assert.equal(seen,1);
 await assert.rejects(publish(wrap,{handle:'@outra',state},{text:'teste'},null,async()=>{seen++;}),SessionError);
 assert.equal(seen,1);
 const ctx=await wrap.newContext();const page=await ctx.newPage();
 await page.goto('https://www.threads.com/');
 assert.equal((await identify(page)).handle,'@teste');
 await ctx.close();
 console.log('Edge: navegador do Windows, confirmação de perfil e envio simulado, bloqueio de conta errada.');
}finally{await browser.close();}
