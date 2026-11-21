import {Queue,Worker,DelayedError} from 'bullmq';
import Redis from 'ioredis';
import {SessionError} from './threads.js';

export function redisUrl(value){
  const url=new URL(value);
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(!['redis:','rediss:'].includes(url.protocol)||(url.protocol==='redis:'&&!local)||url.hash||url.search)
    throw Error('Use redis:// para Redis local ou rediss:// para Redis remoto.');
  return url.href;
}

export async function connectQueue({url,prefix,accounts,mediaPath,browser,publish,changed=()=>{},concurrency=3}){
  const connection=new Redis(redisUrl(url),{lazyConnect:true,connectTimeout:2500,maxRetriesPerRequest:1,enableOfflineQueue:false,retryStrategy:attempt=>Math.min(attempt*500,5000)});
  connection.on('error',()=>changed());
  try {await connection.connect();await connection.ping();}
  catch(error){connection.disconnect();throw error;}
  const queue=new Queue('threads',{connection,prefix});
  queue.on('error',changed);
  const workerConnection=new Redis(redisUrl(url),{maxRetriesPerRequest:null});
  workerConnection.on('error',changed);
  const active=new Set();
  const worker=new Worker('threads',async(job,token)=>{
    const data=job.data;
    if(data.sent)return {status:'verificar',reason:'Envio interrompido. Confira o Threads antes de repetir.'};
    if(active.has(data.accountId)){
      await job.moveToDelayed(Date.now()+500,token);
      throw new DelayedError();
    }
    const account=accounts.get(data.accountId);
    if(!account)throw Error('Conta removida ou indisponível.');
    if(account.pending)throw Error('Sessão precisa ser reconectada.');
    active.add(account.id);
    let sent=false;
    try{
      return await publish(await browser(),account,data,data.media && mediaPath(data.media),async()=>{
        await job.updateData({...data,sent:true});
        sent=true;
      });
    }catch(error){
      if(sent)return {status:'verificar',reason:'O Threads não confirmou o envio. Confira o perfil antes de repetir.'};
      if(error instanceof SessionError){
        await accounts.markPending(account.id,account.verifiedAt);
        throw Error(error.message);
      }
      throw Error(String(error.message).split('\n')[0]);
    }finally{active.delete(account.id);}
  },{connection:workerConnection,prefix,concurrency,maxStalledCount:1});
  for(const event of ['active','completed','failed','error','stalled'])worker.on(event,changed);
  async function list(){
    const types=['delayed','waiting','active','completed','failed'];
    const jobLists=await Promise.all(types.map(type=>queue.getJobs([type],0,['completed','failed'].includes(type)?199:-1,type==='delayed')));
    const labels={delayed:'agendado',waiting:'agendado',active:'publicando',completed:'publicado',failed:'falhou'};
    return jobLists.flatMap((jobs,i)=>jobs.map(job=>{
      const {text,at,handle,accountId,media,sent}=job.data;
      const status=job.returnvalue?.status||(types[i]==='failed'&&sent?'verificar':labels[types[i]]);
      return {id:job.id,text,at,handle,accountId,media:media?.name,status,
        reason:job.returnvalue?.reason||job.failedReason,finishedAt:job.finishedOn,startedAt:job.processedOn};
    })).sort((a,b)=>b.at-a.at);
  }
  return {
    concurrency,
    get ready(){return connection.status==='ready';},
    list,
    async add(posts){
      const timestamp=Date.now();
      await queue.addBulk(posts.map(data=>({name:'publish',data,opts:{timestamp,delay:Math.max(0,data.at-timestamp),attempts:1}})));
      changed();
    },
    async cancel(id){
      const job=await queue.getJob(id);
      if(!job||!['waiting','delayed'].includes(await job.getState()))throw Error('Só é possível cancelar uma publicação pendente.');
      await job.remove();
      changed();
    },
    async close(){
      const force=workerConnection.status!=='ready';
      await worker.close(force);
      await queue.close();
      workerConnection.disconnect();connection.disconnect();
    }
  };
}
