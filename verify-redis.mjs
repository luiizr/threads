import assert from 'node:assert/strict';
import net from 'node:net';
import {mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as wait} from 'node:timers/promises';
import {connectQueue} from './src/queue.js';
import {SessionError} from './src/threads.js';

const dir=await mkdtemp(resolve('redis-test-data-'));
const socket=net.createServer();
await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
const port=socket.address().port;
await new Promise(resolve=>socket.close(resolve));
const exe=resolve('redis-test/Redis-8.2.10-Windows-x64-msys2/redis-server.exe');
const server=spawn(exe,['--bind','127.0.0.1','--port',String(port),'--save','','--appendonly','yes'],{cwd:dir,windowsHide:true,stdio:['ignore','pipe','pipe']});
const exited=new Promise(resolve=>server.once('close',resolve));
server.stderr.on('data',data=>process.stderr.write(data));
const accounts=new Map(['a','b','c','d'].map(id=>[id,{id,handle:'@'+id}]));
accounts.markPending=async id=>{accounts.get(id).pending=true;};
const startTimes=[];
let concurrent=0,peak=0;
const occupied=new Set();
const setup={
  url:'redis://127.0.0.1:'+port,prefix:'threadflow-test',accounts,mediaPath:()=>null,browser:async()=>null,
  publish:async(browser,account,post,media,beforeSend)=>{
    assert.ok(!occupied.has(account.id),'Dois envios simultâneos na mesma conta');
    occupied.add(account.id);peak=Math.max(peak,++concurrent);startTimes.push(Date.now());
    try{
      await wait(450);
      if(post.text==='expirou')throw new SessionError('Sessão expirada');
      await beforeSend();
      if(post.text==='incerto')throw Error('confirmação ausente');
      return {status:'publicado',confirmedAt:Date.now()};
    }finally{occupied.delete(account.id);concurrent--;}
  }
};
let queue;
async function seed(id,text,at){return {accountId:id,handle:'@'+id,text,at};}
try{
 for(let i=0;i<30&&!queue;i++){
   try{queue=await connectQueue(setup);}catch{await wait(200);}
 }
 assert.ok(queue,'Redis de teste nunca iniciou');
 const at=Date.now()+2500;
 const items=await Promise.all([seed('a','a1',at),seed('a','a2',at),seed('b','b1',at),seed('c','incerto',at),seed('d','expirou',at)]);
 await queue.add(items);
 assert.equal((await queue.list()).filter(item=>item.status==='agendado').length,5);
 assert.equal(startTimes.length,0);
 await queue.close();queue=await connectQueue(setup);
 await queue.add([await seed('a','cancelar',at+60000)]);
 const cancel=(await queue.list()).find(item=>item.text==='cancelar');
 await queue.cancel(cancel.id);
 let jobs;
 for(let i=0;i<120;i++){
   jobs=await queue.list();
   if(jobs.length===5&&jobs.every(item=>['publicado','falhou','verificar'].includes(item.status)))break;
   await wait(100);
 }
 assert.equal(jobs.filter(item=>item.status==='publicado').length,3);
 assert.equal(jobs.find(item=>item.text==='incerto').status,'verificar');
 assert.equal(jobs.find(item=>item.text==='expirou').status,'falhou');
 assert.ok(accounts.get('d').pending);
 assert.ok(startTimes.every(time=>time>=at),'A fila enviou antes do horário');
 assert.equal(peak,3);
 assert.equal(startTimes.length,5);
 console.log('Redis real: 5 tarefas, persistência ao reabrir, cancelamento, pico de 3 contas, exclusão por conta, sessão pendente e envio ambíguo sem repetição. Primeiro despacho '+(Math.min(...startTimes)-at)+' ms após o horário.');
 await queue.add(Array.from({length:220},(_,i)=>({accountId:'perfil-'+i,handle:'@perfil'+i,text:'Lote de teste',at:Date.now()+120000})));
 assert.equal((await queue.list()).filter(item=>item.status==='agendado').length,220);
 console.log('Redis real: 220 destinos cadastrados no mesmo lote, todos visíveis na fila.');
}finally{
 await queue?.close().catch(()=>{});
 server.kill();await exited;
 await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
