import {app,BrowserWindow,Tray,Menu,nativeImage,ipcMain,dialog,safeStorage} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import {availableParallelism,freemem} from 'node:os';
import {randomBytes,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {connectQueue,redisUrl} from './queue.js';
import {launch,identify,openHome,publish,SessionError} from './threads.js';
import {availablePort,startLocalRedis,stopLocalRedis} from './managed-redis.js';

const routes=['welcome','overview','accounts','posts','logs','settings'];
let window,tray,closing=false,queue,redisError='',login,workerBrowser,selected,activeJobs=0,idleTimer,warmTimer,warming=false;
let accountChanges=Promise.resolve();
let redisBusy=false;
let local;
const publicationSlots=()=>Math.max(1,Math.min(availableParallelism(),Math.floor(freemem()/(350*1024*1024))));
let dataFile,mediaDir,root,managedUrl,provisioning=false;
const pages=fileURLToPath(new URL('./ui/',import.meta.url));
const mediaTypes={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.mp4':'video/mp4','.mov':'video/quicktime'};
function notify(){if(window&&!window.isDestroyed()&&!window.webContents.isDestroyed())window.webContents.send('threadflow:change');}
function persist(next){
  const write=accountChanges.then(async()=>{
    const state=typeof next==='function'?next(local):next;
    if(!safeStorage.isEncryptionAvailable())throw Error('A criptografia do Windows está indisponível.');
    const temp=dataFile+'.tmp';
    await fs.writeFile(temp,safeStorage.encryptString(JSON.stringify(state)));
    await fs.rename(temp,dataFile);
    local=state;
  });
  accountChanges=write.catch(()=>{});
  return write;
}
const accounts={
  get:id=>local.accounts.find(account=>account.id===id),
  markPending:async(id,reviewedAt)=>{
    await persist(state=>({...state,accounts:state.accounts.map(account=>account.id===id&&account.verifiedAt===reviewedAt?{...account,pending:true}:account)}));
    notify();
  }
};
function mediaPath(media){
  if(!/^[a-f0-9-]{36}\.(jpg|jpeg|png|webp|mp4|mov)$/i.test(media.file))throw Error('Mídia inválida.');
  return path.join(mediaDir,media.file);
}
async function browser(){
  clearTimeout(idleTimer);
  workerBrowser ||= launch().catch(error=>{workerBrowser=null;throw error;});
  const instance=await workerBrowser;
  if(!instance.isConnected()){workerBrowser=null;return browser();}
  return instance;
}
async function send(...args){
  activeJobs++;
  try{return await publish(...args);}
  finally{
    if(--activeJobs===0)idleTimer=setTimeout(async()=>{
      const current=workerBrowser;workerBrowser=null;
      if(current)await current.then(instance=>instance.close()).catch(()=>{});
    },30000);
  }
}
async function warmUpcoming(){
  if(closing||warming||workerBrowser||!queue?.ready)return;
  warming=true;
  try{
    const at=await queue.nextDue();
    if(!at||at-Date.now()>18000)return;
    await browser();
    if(!activeJobs)idleTimer=setTimeout(async()=>{
      const current=workerBrowser;workerBrowser=null;
      if(current)await current.then(instance=>instance.close()).catch(()=>{});
    },30000);
  }catch{}finally{warming=false;}
}
async function redisConnect(url,store=false){
  if(redisBusy)throw Error('Já existe uma conexão Redis em andamento.');
  redisBusy=true;
  let next;
  try{
    const normalized=redisUrl(url);
    if(queue?.ready&&normalized===local.redis)return;
    if(queue?.ready&&normalized!==local.redis&&(await queue.list()).some(job=>['agendado','publicando'].includes(job.status)))
      throw Error('Finalize os agendamentos pendentes antes de trocar o Redis.');
    next=await connectQueue({url:normalized,prefix:'threadflow-'+local.installationId,accounts,mediaPath,browser,publish:send,changed:notify,concurrency:publicationSlots()});
    if(store)await persist(state=>({...state,redis:normalized,useManaged:false}));
    await queue?.close();
    queue=next;redisError='';
  }catch(error){
    await next?.close().catch(()=>{});
    redisError='Confira se o Redis está acessível e se as credenciais estão corretas.';
    if(error.message.startsWith('Finalize')||error.message.startsWith('Use redis'))throw error;
    throw Error(redisError);
  }finally{redisBusy=false;notify();}
}
function requireQueue(){if(!queue?.ready||redisBusy)throw Error('Conecte o Redis em Configurações.');return queue;}
async function provisionLocal(){
  if(provisioning)throw Error('O Redis local está sendo preparado.');
  provisioning=true;
  redisError='';
  notify();
  try{
    const credentials=local.managed||{port:await availablePort(),password:randomBytes(24).toString('hex')};
    if(!local.managed)await persist(state=>({...state,managed:credentials}));
    managedUrl=await startLocalRedis(root,credentials);
    if(closing){await stopLocalRedis(managedUrl);return;}
    await redisConnect(managedUrl);
    await persist(state=>({...state,managed:credentials,useManaged:true,redis:managedUrl}));
  }finally{provisioning=false;notify();}
}
function show(route,flow){
  if(!routes.includes(route))throw Error('Tela inválida.');
  if(window?.isDestroyed()||!window)return;
  return window.loadFile(path.join(pages,route+'.html'),route==='accounts'&&flow==='connect'?{hash:'connect'}:{});
}
function publicAccount({state,...account}){return account;}
async function disposeLogin(entry=login){
  if(!entry)return;
  if(login===entry)login=null;
  clearTimeout(entry.timer);
  await entry.browser?.close().catch(()=>{});
}
async function beginLogin(expected){
  if(login)throw Error('Já existe um login aberto.');
  if(expected&&!accounts.get(expected))throw Error('Conta não encontrada.');
  const entry={expected};login=entry;
  try{
    entry.browser=await launch(false);
    if(login!==entry){await entry.browser.close();throw Error('Login cancelado.');}
    entry.context=await entry.browser.newContext();
    entry.page=await entry.context.newPage();
    await openHome(entry.page);
    entry.timer=setTimeout(()=>disposeLogin(entry),300000);
  }catch(error){await disposeLogin(entry);throw error;}
}
async function saveLogin(){
  const entry=login;
  if(!entry?.page||entry.saving)throw Error('Abra o Threads ou aguarde a verificação.');
  entry.saving=true;
  try{
    if(entry.page.isClosed())throw Error('A janela de login foi fechada. Abra outra.');
    const identity=await identify(entry.page,{details:true});
    if(entry.expected&&accounts.get(entry.expected)?.handle.toLowerCase()!==identity.handle.toLowerCase())
      throw Error('A conta aberta é diferente da que você está reconectando.');
    const state=await entry.context.storageState({indexedDB:true});
    const check=await entry.browser.newContext({storageState:state});
    try{
      const page=await check.newPage();await openHome(page);
      if((await identify(page)).handle.toLowerCase()!==identity.handle.toLowerCase())throw Error('A sessão restaurada abriu outro perfil.');
    }finally{await check.close();}
    if(login!==entry)throw Error('Login cancelado.');
    let saved;
    await persist(previous=>{
      const existing=previous.accounts.find(account=>account.handle.toLowerCase()===identity.handle.toLowerCase());
      saved={...existing,...identity,id:existing?.id||randomUUID(),verifiedAt:Date.now(),pending:false,state};
      return {...previous,welcome:false,accounts:[...previous.accounts.filter(account=>account.id!==saved.id),saved]};
    });
    await disposeLogin(entry);notify();
    return publicAccount(saved);
  }finally{entry.saving=false;}
}
async function verifyAccount(id){
  const account=accounts.get(id);
  if(!account)throw Error('Conta não encontrada.');
  const instance=await launch();
  try{
    const ctx=await instance.newContext({storageState:account.state});
    const page=await ctx.newPage();await openHome(page);
    if((await identify(page)).handle.toLowerCase()!==account.handle.toLowerCase())throw new SessionError('O Threads abriu em outra conta.');
    await persist(state=>({...state,accounts:state.accounts.map(item=>item.id===id&&item.verifiedAt===account.verifiedAt?{...item,pending:false,verifiedAt:Date.now()}:item)}));
  }catch(error){
    if(error instanceof SessionError)await accounts.markPending(id,account.verifiedAt);
    throw error;
  }finally{await instance.close().catch(()=>{});notify();}
}
async function schedule(input){
  const q=requireQueue();
  if(!Array.isArray(input?.accounts)||typeof input.text!=='string')throw Error('Selecione as contas e informe o conteúdo.');
  const ids=[...new Set(input.accounts)];
  const targets=ids.map(id=>accounts.get(id));
  const text=input.text.trim();
  const at=Number(input.at);
  if(!targets.length||targets.some(account=>!account||account.pending)||text.length>500||
     (!text&&!input.media)||!Number.isSafeInteger(at)||at<=Date.now()||at>Date.now()+366*86400000)
    throw Error('Selecione contas conectadas, conteúdo válido e uma data futura.');
  let media;
  if(input.media){
    const item=selected;
    if(!item||input.media!==item.token)throw Error('Selecione o arquivo novamente.');
    media={file:randomUUID()+item.ext,name:item.name};
    const size=(await fs.stat(item.path)).size;
    if(size<=0||size>25*1024*1024)throw Error('A mídia deve ter até 25 MB.');
    await fs.copyFile(item.path,mediaPath(media));
  }
  await q.add(targets.map(account=>({accountId:account.id,handle:account.handle,text,at,media})));
  if(input.media&&selected?.token===input.media)selected=null;
  return targets.length;
}
function register(name,fn){
  ipcMain.handle('threadflow:'+name,async(event,...args)=>{
    if(event.sender!==window?.webContents||event.senderFrame?.parent)throw Error('Origem inválida.');
    return fn(...args);
  });
}
async function readiness(){
  let jobs=null;
  if(queue?.ready)try{jobs=await queue.list();}catch{}
  return {accounts:local.accounts.map(publicAccount),jobs,redisReady:jobs!==null,redisError,autostart:app.getLoginItemSettings().openAtLogin,
    timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,slots:queue?.concurrency??publicationSlots(),profileName:local.profileName||'',provisioning};
}
async function start(){
  root=app.getPath('userData');
  await fs.mkdir(root,{recursive:true});
  dataFile=path.join(root,'workspace.bin');mediaDir=path.join(root,'media');
  await fs.mkdir(mediaDir,{recursive:true});
  try{local=JSON.parse(safeStorage.decryptString(await fs.readFile(dataFile)));}
  catch(error){if(error.code!=='ENOENT')throw error;await persist({installationId:randomUUID(),accounts:[],welcome:true,useManaged:true,redis:'redis://127.0.0.1:6379/'});}
  register('snapshot',readiness);
  register('navigate',(route,flow)=>{if(route==='overview'&&local.welcome)persist(state=>({...state,welcome:false})).catch(()=>{});void show(route,flow).catch(()=>{});});
  register('redis',value=>redisConnect(value,true));
  register('redis-local',provisionLocal);
  register('profile',async name=>{
    if(typeof name!=='string'||name.trim().length>80)throw Error('Use um nome de até 80 caracteres.');
    await persist(state=>({...state,profileName:name.trim()}));notify();
  });
  register('open-login',beginLogin);register('save-login',saveLogin);
  register('cancel-login',()=>disposeLogin());register('verify',verifyAccount);
  register('schedule',schedule);register('cancel-post',id=>requireQueue().cancel(id));
  register('pick-media',async()=>{
    const {canceled,filePaths}=await dialog.showOpenDialog(window,{properties:['openFile'],filters:[{name:'Imagem ou vídeo',extensions:Object.keys(mediaTypes).map(ext=>ext.slice(1))}]});
    if(canceled)return null;
    const file=filePaths[0],ext=path.extname(file).toLowerCase(),size=(await fs.stat(file)).size;
    if(!mediaTypes[ext]||size<=0||size>25*1024*1024)throw Error('Use JPG, PNG, WebP, MP4 ou MOV de até 25 MB.');
    selected={path:file,ext,name:path.basename(file),token:randomUUID()};
    const preview='data:'+mediaTypes[ext]+';base64,'+(await fs.readFile(file)).toString('base64');
    return {token:selected.token,name:selected.name,size,type:mediaTypes[ext],preview};
  });
  register('autostart',value=>{app.setLoginItemSettings({openAtLogin:value===true,args:['--minimized']});notify();});
  window=new BrowserWindow({width:1350,height:880,minWidth:760,minHeight:600,show:false,
    webPreferences:{preload:fileURLToPath(new URL('./preload.cjs',import.meta.url)),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',event=>event.preventDefault());
  window.on('close',event=>{if(!closing){event.preventDefault();window.hide();}});
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="8" fill="#6e46e1"/><path fill="white" d="M7 8h18v4h-7v13h-4V12H7z"/></svg>';
  tray=new Tray(nativeImage.createFromDataURL('data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64')));
  tray.setToolTip('ThreadFlow • Agendador do Threads');
  const reveal=()=>{window.show();window.focus();};
  tray.on('double-click',reveal);
  tray.setContextMenu(Menu.buildFromTemplate([{label:'Abrir ThreadFlow',click:reveal},{label:'Ocultar janela',click:()=>window.hide()},{type:'separator'},{label:'Sair do ThreadFlow',click:()=>app.quit()}]));
  window.once('ready-to-show',()=>{if(!process.argv.includes('--minimized'))window.show();});
  const managedFailure=error=>{redisError=error.message;notify();};
  const override=process.env.THREADFLOW_REDIS_URL;
  if(!override&&local.useManaged===true)void provisionLocal().catch(managedFailure);
  else void redisConnect(override||local.redis).catch(()=>{
    if(!override&&local.useManaged===undefined&&local.redis==='redis://127.0.0.1:6379/')void provisionLocal().catch(managedFailure);
  });
  await show(local.welcome?'welcome':'overview');
  warmTimer=setInterval(warmUpcoming,4000);
}
if(!app.requestSingleInstanceLock())app.quit();
else{
  app.on('second-instance',()=>{window?.show();window?.focus();});
  app.on('before-quit',event=>{
    if(closing)return;
    event.preventDefault();closing=true;
    const timeout=setTimeout(()=>app.exit(0),15000);
    clearTimeout(idleTimer);clearInterval(warmTimer);
    Promise.allSettled([disposeLogin(),queue?.close()])
      .then(()=>Promise.allSettled([managedUrl&&stopLocalRedis(managedUrl),workerBrowser?.then(instance=>instance.close())]))
      .finally(()=>{clearTimeout(timeout);app.quit();});
  });
  app.whenReady().then(start).catch(error=>{dialog.showErrorBox('ThreadFlow',error.message);app.exit(1);});
}
