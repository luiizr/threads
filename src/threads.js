import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
export const home='https://www.threads.com/';
const waitMs=120000;
const require=createRequire(import.meta.url);
const unavailable=/Executable doesn't exist|distribution .*not found/i;
let browserDownload;
function installChromium(){
  browserDownload ||= new Promise((resolve,reject)=>{
    const cli=path.join(path.dirname(require.resolve('playwright-core/package.json')),'cli.js');
    const child=spawn(process.execPath,[cli,'install','chromium'],{
      windowsHide:true,stdio:'ignore',env:{...process.env,...(process.versions.electron?{ELECTRON_RUN_AS_NODE:'1'}:{})}
    });
    const timer=setTimeout(()=>child.kill(),480000);
    child.once('error',()=>{clearTimeout(timer);reject(Error('Não foi possível iniciar o download do navegador.'));});
    child.once('close',code=>{
      clearTimeout(timer);
      if(code===0)resolve();else reject(Error('O Chromium não pôde ser baixado. Verifique a internet e tente novamente.'));
    });
  }).finally(()=>{browserDownload=null;});
  return browserDownload;
}
export class SessionError extends Error {}
export async function launch(headless=true){
  for(const channel of ['msedge','chrome',undefined]){
    try{return await chromium.launch({channel,headless,timeout:waitMs});}
    catch(error){if(!unavailable.test(error.message))throw error;}
  }
  await installChromium();
  return chromium.launch({headless,timeout:waitMs});
}
export async function openHome(page){
  await page.goto(home,{waitUntil:'domcontentloaded',timeout:waitMs});
}
export async function identify(page,{details=false}={}){
  const profile=page.getByRole('link',{name:/^(profile|perfil|your profile|seu perfil)\b/i})
    .or(page.locator('a[href^="/@"]:has([aria-label="Profile" i]), a[href^="/@"]:has([aria-label="Perfil" i])'))
    .or(page.locator('nav a[href^="/@"], [role="navigation"] a[href^="/@"]'));
  const end=Date.now()+waitMs;
  while(Date.now()<end){
    if (/\/(?:login|accounts\/login)(?:[/?#]|$)/i.test(page.url())) throw new SessionError('Entre novamente no Threads.');
    const links=await profile.evaluateAll(nodes=>nodes.map(node=>({href:node.href,avatar:node.querySelector('img')?.currentSrc})));
    const matches=links.map(link=>({...link,handle:new URL(link.href).pathname.match(/^\/@([\w.]+)\/?$/)?.[1]})).filter(link=>link.handle);
    const names=[...new Set(matches.map(link=>link.handle))];
    if(names.length===1){
      const handle=names[0];
      const result={handle:'@'+handle};
      if(!details)return result;
      const member=matches.find(link=>link.avatar)||matches[0];
      let avatar=member.avatar;
      try {
        await page.goto(new URL('/@'+handle,home).href,{waitUntil:'domcontentloaded',timeout:waitMs});
        const title=await page.locator('meta[property="og:title"]').evaluateAll(nodes=>nodes[0]?.content);
        if(title?.includes('@'+handle))result.name=title.split('(@'+handle)[0].trim()||undefined;
        avatar||=await page.locator('meta[property="og:image"]').evaluateAll(nodes=>nodes[0]?.content);
      }catch{}
      if(avatar&&/^https:\/\/[^/]+\.(?:cdninstagram\.com|fbcdn\.net)\//i.test(avatar)){
        try{
          const r=await page.request.get(avatar,{timeout:waitMs,maxRedirects:0});
          const type=r.headers()['content-type']?.split(';')[0];
          if(r.ok()&&['image/jpeg','image/png','image/webp'].includes(type)){
            const image=await r.body();
            if(image.length<=524288)result.avatar='data:'+type+';base64,'+image.toString('base64');
          }
        }catch{}
      }
      return result;
    }
    if(names.length>1)break;
    await page.waitForTimeout(250);
  }
  throw new SessionError('Não foi possível confirmar o perfil. Confira se a conta está conectada ao Threads.');
}
export async function publish(browser,account,job,media,beforeSend){
  const ctx=await browser.newContext({storageState:account.state});
  ctx.setDefaultTimeout(waitMs);
  let stage='carregar o Threads';
  try {
    const page=await ctx.newPage();
    await openHome(page);
    if((await identify(page)).handle.toLowerCase()!==account.handle.toLowerCase())throw new SessionError('O Threads abriu em outra conta.');
    stage='abrir o editor de publicação';
    const create=/^(create(?: a post| post| thread)?|criar(?: uma publicação| publicação| thread)?|new (?:thread|post)|nov[ao] (?:thread|publicação)|start a thread|iniciar (?:um|uma) thread)[.!…]?$/i;
    const opener=page.getByRole('button',{name:create}).or(page.getByRole('link',{name:create})).filter({visible:true});
    const dialog=page.getByRole('dialog');
    const editor=dialog.locator('[contenteditable="true"]').filter({visible:true});
    await opener.or(editor).first().waitFor({state:'visible'});
    if(!await editor.isVisible())await opener.first().click();
    await editor.waitFor({state:'visible'});
    if(job.text)await editor.fill(job.text);
    if(media){
      stage='carregar a mídia';
      const input=dialog.locator('input[type="file"]').first();
      if(await input.count())await input.setInputFiles(media);
      else{
        const button=dialog.getByRole('button',{name:/attach|add (?:photo|media|video)|anexar|adicionar (?:foto|mídia|vídeo)/i});
        const [chooser]=await Promise.all([page.waitForEvent('filechooser',{timeout:waitMs}),button.click()]);
        await chooser.setFiles(media);
      }
      await dialog.locator('img[src^="blob:"],img[src^="data:image/"],video,button[aria-label*="Remove attachment" i],button[aria-label*="Remover anexo" i]').filter({visible:true}).first().waitFor();
    }
    const submit=dialog.getByRole('button',{name:/^(post|postar|publicar)$/i});
    stage='habilitar o botão Publicar';
    await submit.click({trial:true});
    await beforeSend();
    stage='confirmar a publicação no Threads';
    await submit.click();
    await page.getByText(/^(posted|thread posted|publicado|thread publicado)[.!]?$/i).filter({visible:true}).first().waitFor();
    return {status:'publicado',confirmedAt:Date.now()};
  }catch(error){
    if(error.name==='TimeoutError')throw Error('O Threads levou mais de 2 minutos para '+stage+'.');
    throw error;
  }finally{await ctx.close().catch(()=>{});}
}
