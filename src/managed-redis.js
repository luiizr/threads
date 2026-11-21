import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import {setTimeout as wait} from 'node:timers/promises';
import Redis from 'ioredis';

const version='8.2.10';
const bundle='Redis-'+version+'-Windows-x64-msys2';
const original='https://github.com/redis-windows/redis-windows/releases/download/'+version+'/'+bundle+'.zip';
const sha256='281f180eaba420f43eb18d655197d55bf804eb692bc55209264bfb284da3850f';
function run(command,args){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{windowsHide:true,stdio:'ignore'});
    child.once('error',reject);child.once('close',code=>code===0?resolve():reject(Error('A extração do Redis terminou com código '+code+'.')));
  });
}
async function probe(url){
  const client=new Redis(url,{lazyConnect:true,connectTimeout:500,retryStrategy:()=>null,enableOfflineQueue:false});
  client.on('error',()=>{});
  try{await client.connect();return (await client.ping())==='PONG';}
  catch{return false;}
  finally{client.disconnect();}
}
export async function availablePort(){
  const socket=net.createServer();
  await new Promise((resolve,reject)=>socket.once('error',reject).listen(0,'127.0.0.1',resolve));
  const port=socket.address().port;
  await new Promise(resolve=>socket.close(resolve));
  return port;
}
export async function startLocalRedis(root,credentials){
  const dir=path.join(root,'redis');
  const runtime=path.join(dir,'runtime');
  const data=path.join(dir,'data');
  await fs.mkdir(runtime,{recursive:true});await fs.mkdir(data,{recursive:true});
  const exe=path.join(runtime,bundle,'redis-server.exe');
  try{await fs.access(exe);}
  catch(error){
    if(error.code!=='ENOENT')throw error;
    const response=await fetch(original,{signal:AbortSignal.timeout(90000)});
    if(!response.ok)throw Error('Falha ao baixar Redis para Windows.');
    const bytes=Buffer.from(await response.arrayBuffer());
    if(createHash('sha256').update(bytes).digest('hex')!==sha256)throw Error('A integridade do pacote do Redis não pôde ser confirmada.');
    const zip=path.join(dir,bundle+'.zip');
    await fs.writeFile(zip,bytes);
    try{
      await run(path.join(process.env.SystemRoot||'C:/Windows','System32','tar.exe'),['-xf',zip,'-C',runtime]);
      await fs.access(exe);
    }finally{await fs.unlink(zip).catch(()=>{});}
  }
  const {port,password}=credentials;
  const url='redis://:'+password+'@127.0.0.1:'+port+'/';
  if(await probe(url))return url;
  const child=spawn(exe,['-'],{cwd:data,windowsHide:true,stdio:['pipe','ignore','ignore']});
  let failure;
  child.on('error',error=>{failure=error;});
  child.stdin.on('error',()=>{});
  child.stdin.end(['bind 127.0.0.1','protected-mode yes','port '+port,'requirepass '+password,
     'appendonly yes','appendfsync everysec','maxmemory-policy noeviction','save ""'].join('\n')+'\n');
  for(let i=0;i<30;i++){
    if(failure||child.exitCode!==null)break;
    if(await probe(url))return url;
    await wait(200);
  }
  child.kill();
  throw Error('O Redis local não iniciou. Confira se a porta configurada está livre.');
}

export async function stopLocalRedis(url){
  const client=new Redis(url,{lazyConnect:true,connectTimeout:500,retryStrategy:()=>null,maxRetriesPerRequest:0});
  client.on('error',()=>{});
  try{await client.connect();await client.shutdown('SAVE');}
  catch{}
  finally{client.disconnect();}
}
