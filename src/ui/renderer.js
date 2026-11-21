'use strict';
const api=window.threadflow;
const route=document.body.dataset.route;
const main=document.querySelector('main');
const nav=document.querySelector('aside nav');
const by=id=>document.getElementById(id);
const date=new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'});
const time=value=>value?date.format(value):'—';
const statuses={agendado:'Agendado',publicando:'Publicando',publicado:'Publicado',falhou:'Falhou',verificar:'Verificar no Threads'};
const labels={overview:'Métricas',accounts:'Contas',posts:'Publicações',logs:'Logs',settings:'Configurações',welcome:'Boas-vindas'};
const pattern={overview:/métricas|visão geral/i,accounts:/contas/i,posts:/publicações/i,logs:/logs/i,settings:/configurações/i,welcome:/boas-vindas/i};
let snapshot,refreshing=false,statusFilter='',accountFilter='',term='',period=7,calendar=false,week=0,attachment,openedLogin=false,selectedLog;
const refs={};
function element(tag,text,cls){
  const node=document.createElement(tag);
  if(text!==undefined)node.textContent=text;
  if(cls)node.className=cls;
  return node;
}
function button(text,fn,primary=false){
  const node=element('button',text,'tf-button'+(primary?' tf-primary':''));
  node.type='button';node.onclick=fn;return node;
}
function feedback(text,error=false){
  refs.notice.textContent=text;
  refs.notice.dataset.error=String(error);
  refs.notice.hidden=!text;
}
async function action(fn){
  feedback('');
  try{return await fn();}catch(error){feedback(error.message.replace(/^Error invoking remote method '[^']+': Error: /,''),true);}
}
const nodes=[];
const walker=document.createTreeWalker(main,NodeFilter.SHOW_COMMENT);
while(walker.nextNode())nodes.push(walker.currentNode);
function marker(re){return nodes.find(node=>re.test(node.textContent.trim()));}
function after(re){return marker(re)?.nextElementSibling;}
function clear(node){node?.replaceChildren();return node;}
function remove(re){after(re)?.remove();}
function panel(title){const node=element('section',undefined,'tf-panel');node.append(element('h2',title,'font-headline-md text-headline-md'));return node;}
function place(node){main.append(node);return node;}
function textOnly(match,value){
  const container=after(match);
  if(container)container.replaceChildren(element('p',value,'text-on-surface-variant'));
}
function installNav(){
  for(const anchor of document.querySelectorAll('a[href]')){
    const raw=[...anchor.childNodes].filter(node=>node.nodeType===3).map(node=>node.textContent).join(' ').trim()||anchor.textContent;
    const destination=Object.keys(pattern).find(name=>pattern[name].test(raw));
    if(anchor.closest('aside nav')&&destination){
      anchor.setAttribute('href','#'+destination);
      anchor.setAttribute('aria-label',labels[destination]);
      anchor.setAttribute('aria-current',destination===route?'page':'false');
      if(destination===route)anchor.classList.add('bg-primary-container','text-on-primary-container','font-semibold','rounded-lg');
      anchor.onclick=event=>{event.preventDefault();void api.invoke('navigate',destination);};
    } else if(anchor.getAttribute('href')==='#'||/^https?:/i.test(anchor.href)){
      anchor.removeAttribute('href');anchor.setAttribute('aria-disabled','true');
    }
  }
}
function existingButton(re,click,root=main){
  const buttons=[...root.querySelectorAll('button')].filter(item=>re.test(item.textContent));
  for(const node of buttons){node.disabled=false;node.onclick=click;node.type='button';}
  return buttons[0];
}
function avatar(account){
  const frame=element('div',undefined,'tf-avatar');
  if(account.avatar?.startsWith('data:image/')){
    const img=element('img');img.src=account.avatar;img.alt='';
    img.onerror=()=>{frame.textContent=account.handle.slice(1,3).toUpperCase();};frame.append(img);
  }else frame.textContent=account.handle.slice(1,3).toUpperCase();
  return frame;
}
function noticeBox(){
  const box=element('p','', 'tf-notice');box.hidden=true;box.setAttribute('role','status');main.prepend(box);return box;
}
function prepare(){
  installNav();
  const accountLabel=[...document.querySelectorAll('header span')].find(node=>/^Todas as contas\s*\(\d+\)$/i.test(node.textContent.trim()));
  if(accountLabel){
    const previous=accountLabel.closest('button')||accountLabel.parentElement;
    refs.headerAccounts=element('select',undefined,'tf-header-accounts');
    refs.headerAccounts.setAttribute('aria-label','Conta na tela atual');
    refs.headerAccounts.append(new Option('Carregando contas…',''));
    refs.headerAccounts.disabled=true;
    refs.headerAccounts.onchange=()=>{accountFilter=refs.headerAccounts.value;render();};
    previous.replaceWith(refs.headerAccounts);
  }
  existingButton(/nova publicação/i,()=>route==='posts'?compose():api.invoke('navigate','posts'),document.body);
  const staticText=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  while(staticText.nextNode()){
    const node=staticText.currentNode;
    if(node.parentElement?.closest('style,script'))continue;
    node.textContent=node.textContent.replaceAll('Luiz Silva','Perfil local').replaceAll('v1.4','v0.1.6')
      .replaceAll('Banco SQLite local seguro.','').replaceAll('Armazenado no SQLite local','Armazenado neste computador');
  }
  for(const control of main.querySelectorAll('button,input,select,textarea'))control.disabled=true;
  refs.notice=noticeBox();
  const heading=main.querySelector('h1');
  if(heading&&route==='overview')heading.textContent='Visão geral';
  if(heading&&route==='logs')heading.textContent='Logs e diagnósticos';
  if(route==='welcome'){
    for(const image of main.querySelectorAll('img'))image.remove();
    for(const strong of main.querySelectorAll('strong'))if(/api|token/i.test(strong.textContent))strong.textContent='Sessão do Threads';
    const cta=panel('Primeiros passos');
    refs.profile=by('username-input');
    if(refs.profile){refs.profile.value='';refs.profile.disabled=false;refs.profile.maxLength=80;refs.profile.oninput=renderProfile;renderProfile();}
    const continueConnection=()=>action(async()=>{
      if(refs.profile)await api.invoke('profile',refs.profile.value);
      await api.invoke('navigate','accounts','connect');
    });
    existingButton(/continuar para conexão/i,continueConnection);
    refs.firstRun=element('p','Preparando a fila local…');refs.firstRun.setAttribute('role','status');
    cta.append(refs.firstRun,element('p','Entre no Threads em uma janela separada para salvar seu primeiro perfil.'),
      button('Configurações da fila',()=>api.invoke('navigate','settings')),button('Conectar conta',continueConnection,true),
      button('Ir para métricas',()=>action(async()=>{if(refs.profile)await api.invoke('profile',refs.profile.value);await api.invoke('navigate','overview');})));
    place(cta);
    existingButton(/começar|iniciar/i,()=>api.invoke('navigate','accounts'));
  }
  if(route==='accounts'){
    refs.accounts=clear(after(/Responsive Accounts Grid/))||place(panel('Contas conectadas'));
    remove(/Empty State Fallback/);remove(/Bottom Workspace Diagnostic/);
    const filters=after(/Filters, Status Counters/);
    if(filters){filters.replaceChildren();refs.search=element('input');refs.search.placeholder='Buscar por nome ou @usuário';
      refs.search.oninput=()=>{term=refs.search.value.toLowerCase();render();};filters.append(refs.search);}
    const metrics=after(/Quick Metrics Overview/);
    if(metrics){metrics.replaceChildren();refs.accountCount=element('span');metrics.append(refs.accountCount);}
    const open=existingButton(/adicionar conta|conectar conta/i,()=>loginDialog());
    if(!open)main.prepend(button('Conectar conta',()=>loginDialog(),true));
    if(location.hash==='#connect')loginDialog();
  }
  if(route==='overview'){
    refs.health=clear(after(/Account Health Strip/));
    remove(/Red Action Alert Banner/);
    const cards=after(/KPI Cards Grid/);
    const titles=['Contas salvas','Agendadas','Publicadas','Precisam de atenção','Publicando'];
    refs.kpis=[];
    if(cards)[...cards.children].slice(0,5).forEach((item,index)=>{
      const icon=item.querySelector('.material-symbols-outlined');
      const number=element('strong','—','font-headline-xl text-headline-xl');
      refs.kpis.push(number);item.replaceChildren(...(icon?[icon]:[]),element('p',titles[index]),number);
    });
    const chart=after(/Left Column: Performance Chart/);
    if(chart){chart.querySelector('h2').textContent='Publicações confirmadas';chart.replaceChildren(chart.querySelector('h2'));refs.chart=element('div',undefined,'tf-bars');chart.append(refs.chart);}
    refs.upcoming=clear(after(/Scheduled Posts List/));
    const bottom=after(/Bottom Section: Desempenho/);
    if(bottom){const title=bottom.querySelector('h2');const tbody=bottom.querySelector('tbody');if(title)title.textContent='Publicações por conta';if(tbody)tbody.replaceChildren();
      refs.performance=tbody;
      const top=after(/Right Part: Top Publicações/);if(top)top.replaceChildren(element('h2','Métricas da rede'),element('p','Visualizações e engajamento do Threads não estão disponíveis nesta versão.'));
      const headers=bottom.querySelector('thead tr');if(headers)headers.replaceChildren(...['Perfil','Agendadas','Publicadas','Atenção'].map(value=>element('th',value)));
    }
    const filters=after(/Period Filter Pill Group/);
    if(filters){filters.replaceChildren(...[7,30,90].map(days=>button(days+' dias',()=>{period=days;render();},days===period)));}
    existingButton(/nova publicação/i,()=>api.invoke('navigate','posts'));
  }
  if(route==='posts'){
    const list=by('view-lista-container');
    if(list){list.replaceChildren();refs.posts=list;}
    const calendarView=by('view-calendario-container');
    if(calendarView){calendarView.remove();}
    const filters=after(/Quick Status Filter Strip/);
    if(filters){filters.replaceChildren();for(const value of ['',...Object.keys(statuses)])filters.append(button(statuses[value]||'Todas',()=>{statusFilter=value;render();}));}
    const toolbar=after(/Dense Desktop Filter Toolbar/);
    if(toolbar){
      toolbar.replaceChildren();const search=element('input');search.placeholder='Buscar publicações';search.oninput=()=>{term=search.value.toLowerCase();render();};
      refs.accountFilter=element('select');refs.accountFilter.setAttribute('aria-label','Filtrar por conta');
      refs.accountFilter.onchange=()=>{accountFilter=refs.accountFilter.value;render();};toolbar.append(search,refs.accountFilter);
    }
    existingButton(/nova publicação/i,()=>compose());
    existingButton(/calendário/i,()=>{calendar=true;render();});
    existingButton(/lista/i,()=>{calendar=false;render();});
    if(!refs.posts)refs.posts=place(panel('Fila'));
  }
  if(route==='logs'){
    refs.logs=clear(after(/LEFT PANE: Unified Activity/))||place(panel('Histórico'));
    refs.detail=clear(after(/RIGHT PANE: Detail Drawer/));
    const filters=after(/Filter & Search Bar/);
    if(filters){filters.replaceChildren();const search=element('input');search.placeholder='Buscar pelo perfil ou conteúdo';search.oninput=()=>{term=search.value.toLowerCase();render();};
      const only=element('input');only.type='checkbox';only.onchange=()=>{statusFilter=only.checked?'errors':'';render();};const label=element('label');label.append(only,document.createTextNode(' Apenas erros e verificações'));filters.append(search,label);}
    existingButton(/atualizar/i,refresh);
  }
  if(route==='settings'){
    remove(/Micro Hardware/);
    const head=after(/Header & Auto-Save Pill/);
    if(head)for(const item of head.querySelectorAll('button'))item.disabled=true;
    for(const input of main.querySelectorAll('input')){
      if(input.type==='text'||input.type==='email')input.value='';
      if(input.type==='checkbox'||input.type==='radio')input.checked=false;
    }
    for(const section of main.querySelectorAll('section')){
      if(/perfil local|dados & armazenamento/i.test(section.querySelector('h2')?.textContent||'')){
        for(const image of section.querySelectorAll('img'))image.remove();
      }
    }
    const config=panel('Redis e execução local');refs.redisStatus=element('p');
    const field=element('input');field.type='password';field.autocomplete='off';field.placeholder='redis://127.0.0.1:6379/';field.setAttribute('aria-label','Endereço Redis');
    refs.autostart=element('input');refs.autostart.type='checkbox';refs.autostart.onchange=()=>action(()=>api.invoke('autostart',refs.autostart.checked));
    const auto=element('label');auto.append(refs.autostart,document.createTextNode(' Iniciar com o Windows, na bandeja'));
    refs.zone=element('p');
    const localRedis=button('Preparar Redis neste computador',()=>action(async()=>{
      localRedis.disabled=true;feedback('Preparando Redis local…');
      try{await api.invoke('redis-local');feedback('Redis local pronto.');await refresh();}
      finally{localRedis.disabled=false;}
    }),true);
    refs.localRedis=localRedis;
    config.append(refs.redisStatus,localRedis,field,button('Conectar Redis existente',()=>action(async()=>{await api.invoke('redis',field.value||field.placeholder);field.value='';await refresh();})),auto,refs.zone,
      element('p','Fechar a janela mantém a fila ativa na bandeja. O computador precisa estar ligado e conectado à internet.'));
    main.prepend(config);
    for(const link of by('settings-nav')?.querySelectorAll('a')||[]){
      const id=link.getAttribute('href');if(id?.startsWith('#')&&id.length>1)link.onclick=event=>{event.preventDefault();by(id.slice(1))?.scrollIntoView();};
    }
  }
}
function pill(text,value){const node=element('span',text,'tf-pill');node.dataset.status=value;return node;}
function postRow(job,actions=false){
  const row=element('article',undefined,'tf-post');
  row.append(element('strong',job.handle),element('time',time(job.at)),element('p',job.text||job.media||'Publicação com mídia'),pill(statuses[job.status]||job.status,job.status));
  if(job.status==='publicando'&&job.stage?.name){
    const seconds=Math.max(0,Math.floor((Date.now()-job.stage.at)/1000));
    row.append(element('small',job.stage.name+' · '+seconds+' s'));
  }
  if(job.reason)row.append(element('small',job.reason,'tf-reason'));
  if(actions&&job.status==='agendado')row.append(button('Cancelar agendamento',()=>action(async()=>{if(confirm('Cancelar esta publicação?'))await api.invoke('cancel-post',job.id);await refresh();})));
  return row;
}
function selectedJobs(jobs){
  return jobs.filter(job=>(!statusFilter||(statusFilter==='errors'?['falhou','verificar'].includes(job.status):job.status===statusFilter))&&
   (!accountFilter||job.accountId===accountFilter)&&(!term||(job.handle+' '+job.text+' '+(job.reason||'')).toLowerCase().includes(term)));
}
function renderCalendar(jobs){
  const grid=element('div',undefined,'tf-week');
  const now=new Date();const mon=new Date(now.getFullYear(),now.getMonth(),now.getDate()-(now.getDay()+6)%7+week*7);
  const actions=element('div',undefined,'tf-row');
  actions.append(button('Semana anterior',()=>{week--;render();}),button('Hoje',()=>{week=0;render();}),button('Próxima semana',()=>{week++;render();}));
  refs.posts.append(actions,grid);
  for(let i=0;i<7;i++){
    const day=new Date(mon);day.setDate(mon.getDate()+i);
    const next=new Date(day);next.setDate(day.getDate()+1);
    const box=panel(new Intl.DateTimeFormat('pt-BR',{weekday:'short',day:'numeric',month:'numeric'}).format(day));
    for(const job of jobs.filter(item=>item.at>=+day&&item.at<+next))box.append(postRow(job));
    grid.append(box);
  }
}
function empty(node,text){if(node&&!node.children.length)node.append(element('p',text,'tf-empty'));}
function renderProfile(){
  const caption=by('avatar-name-caption');
  if(!caption)return;
  const name=refs.profile?.value.trim()||'';
  caption.textContent=name||'Perfil local';
  if(caption.previousElementSibling)caption.previousElementSibling.textContent=name.split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]?.toUpperCase()).join('')||'—';
}
function render(){
  if(!snapshot)return;
  const {accounts,jobs,redisReady}=snapshot;
  const redisStatus=redisReady?'Redis conectado':snapshot.provisioning?'Preparando Redis local…':snapshot.redisError||'Redis desconectado';
  if(refs.firstRun)refs.firstRun.textContent=redisStatus;
  if(refs.localRedis)refs.localRedis.disabled=snapshot.provisioning;
  if(accountFilter&&!accounts.some(item=>item.id===accountFilter))accountFilter='';
  if(refs.headerAccounts){
    const signature=JSON.stringify(accounts.map(({id,handle,name,pending})=>[id,handle,name,pending]));
    if(refs.headerAccounts.dataset.accounts!==signature){
      refs.headerAccounts.dataset.accounts=signature;
      refs.headerAccounts.replaceChildren(new Option(accounts.length?'Todas as contas ('+accounts.length+')':'Nenhuma conta conectada',''),...accounts.map(item=>
        new Option((item.name&&item.name!==item.handle?item.name+' · ':'')+item.handle+(item.pending?' · reconectar':''),item.id)));
      refs.headerAccounts.disabled=!accounts.length;
    }
    refs.headerAccounts.value=accountFilter;
  }
  const visibleAccounts=accountFilter?accounts.filter(account=>account.id===accountFilter):accounts;
  if(refs.profile&&!refs.profile.dataset.loaded){refs.profile.value=snapshot.profileName||'';refs.profile.dataset.loaded='1';renderProfile();}
  if(refs.redisStatus)refs.redisStatus.textContent=redisStatus;
  if(refs.autostart)refs.autostart.checked=snapshot.autostart;
  if(refs.zone)refs.zone.textContent='Fuso do Windows · '+snapshot.timezone+' · '+snapshot.slots+' vaga(s) de publicação simultânea';
  if(refs.accountCount)refs.accountCount.textContent=accounts.length+' contas salvas · '+accounts.filter(item=>item.pending).length+' para reconectar';
  if(refs.accounts){
    refs.accounts.replaceChildren(...visibleAccounts.filter(item=>((item.name||'')+item.handle).toLowerCase().includes(term)).map(item=>{
      const card=panel(item.name||item.handle);
      const top=element('div',undefined,'tf-row');
      top.append(avatar(item),element('strong',item.handle),pill(item.pending?'Reconectar':'Sessão salva',item.pending?'falhou':'publicado'));
      card.append(top,element('p','Última confirmação: '+time(item.verifiedAt)),
        button('Verificar sessão',()=>action(async()=>{await api.invoke('verify',item.id);feedback('Sessão confirmada para '+item.handle+'.');})),
        button('Reconectar',()=>loginDialog(item.id)));
      return card;
    }));
    empty(refs.accounts,'Nenhuma conta encontrada.');
  }
  const list=accountFilter?(jobs||[]).filter(job=>job.accountId===accountFilter):(jobs||[]);
  if(refs.kpis){
    const now=Date.now(),recent=list.filter(job=>job.at>=now-period*86400000);
    const counts=[visibleAccounts.length,list.filter(item=>item.status==='agendado').length,recent.filter(item=>item.status==='publicado').length,
      recent.filter(item=>['falhou','verificar'].includes(item.status)).length,list.filter(item=>item.status==='publicando').length];
    refs.kpis.forEach((node,i)=>node.textContent=i===0||redisReady?counts[i]:'—');
    refs.health?.replaceChildren(...visibleAccounts.map(item=>pill(item.handle+' · '+(item.pending?'Reconectar':'Sessão salva'),item.pending?'falhou':'publicado')));
    if(refs.health)empty(refs.health,'Nenhuma conta conectada.');
    refs.upcoming?.replaceChildren(...list.filter(item=>item.status==='agendado').sort((a,b)=>a.at-b.at).slice(0,6).map(item=>postRow(item)));
    if(refs.upcoming)empty(refs.upcoming,redisReady?'Nenhuma publicação agendada.':'Conecte o Redis para ver os agendamentos.');
    refs.performance?.replaceChildren(...visibleAccounts.map(account=>{
      const entries=list.filter(item=>item.accountId===account.id);const row=element('tr');
      for(const value of [account.handle,...['agendado','publicado','falhou'].map(status=>redisReady?entries.filter(item=>item.status===status).length:'—')])row.append(element('td',String(value)));
      return row;
    }));
    if(refs.chart){
      const days=Array.from({length:7},(_,i)=>{const day=new Date();day.setHours(0,0,0,0);day.setDate(day.getDate()-6+i);const end=new Date(day);end.setDate(day.getDate()+1);return {day,count:list.filter(item=>item.status==='publicado'&&item.finishedAt>=+day&&item.finishedAt<+end).length};});
      const max=Math.max(1,...days.map(item=>item.count));
      refs.chart.replaceChildren(...days.map(({day,count})=>{const bar=element('div',undefined,'tf-bar');const meter=element('meter');meter.max=max;meter.value=count;bar.append(element('span',new Intl.DateTimeFormat('pt-BR',{day:'numeric',month:'numeric'}).format(day)),meter,element('span',redisReady?String(count):'—'));return bar;}));
    }
  }
  if(refs.posts){
    const next=accounts.map(account=>[account.id,account.handle]);
    refs.accountFilter?.replaceChildren(new Option('Todas as contas',''),...next.map(([id,handle])=>new Option(handle,id)));
    if(refs.accountFilter)refs.accountFilter.value=accountFilter;
    refs.posts.replaceChildren();
    if(calendar&&redisReady)renderCalendar(selectedJobs(list));
    else if(redisReady)refs.posts.append(...selectedJobs(list).map(item=>postRow(item,true)));
    empty(refs.posts,redisReady?'Nenhuma publicação para os filtros escolhidos.':'Redis desconectado. Abra Configurações.');
  }
  if(refs.logs){
    const logs=selectedJobs(list.filter(item=>item.startedAt||item.finishedAt));
    refs.logs.replaceChildren(...logs.map(job=>button(time(job.finishedAt||job.startedAt)+' · '+job.handle+' · '+statuses[job.status],()=>{selectedLog=job.id;render();})));
    empty(refs.logs,redisReady?'Nenhuma execução registrada.':'Redis desconectado.');
    const item=logs.find(job=>job.id===selectedLog);
    refs.detail?.replaceChildren(element('h2','Detalhes da execução'),...(item?[postRow(item),element('p','Início: '+time(item.startedAt)),element('p','Fim: '+time(item.finishedAt))]:[element('p','Selecione um registro.')]));
  }
}
async function refresh(){
  if(refreshing)return;
  refreshing=true;
  try{snapshot=await api.invoke('snapshot');render();}
  catch(error){feedback(error.message,true);}
  finally{refreshing=false;}
}
function modal(title,body){
  const dialog=element('dialog',undefined,'tf-dialog');
  dialog.append(element('h2',title,'font-headline-md text-headline-md'),body);document.body.append(dialog);
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();return dialog;
}
function loginDialog(id){
  const box=element('div',undefined,'tf-form');
  box.append(element('p','Entre manualmente na janela do Threads. Depois, volte e salve o perfil.'));
  const msg=element('p','');msg.setAttribute('role','status');box.append(msg);
  const run=async fn=>{try{await fn();}catch(error){msg.textContent=error.message.replace(/^Error invoking remote method '[^']+': Error: /,'');}};
  const open=button('Abrir Threads',()=>run(async()=>{open.disabled=true;msg.textContent='Abrindo navegador. No primeiro uso, o Chromium pode ser baixado.';try{await api.invoke('open-login',id);openedLogin=true;msg.textContent='Faça login na janela do navegador.';save.disabled=false;}catch(error){open.disabled=false;throw error;}}),true);
  const save=button('Salvar e verificar sessão',()=>run(async()=>{save.disabled=true;try{const item=await api.invoke('save-login');openedLogin=false;dialog.close();feedback('Sessão salva e verificada: '+item.handle);await refresh();}catch(error){save.disabled=false;throw error;}}));
  save.disabled=!openedLogin;
  box.append(open,save,button('Cancelar',()=>dialog.close()));
  const dialog=modal('Conectar conta do Threads',box);
  dialog.addEventListener('close',()=>{if(openedLogin){openedLogin=false;void api.invoke('cancel-login').catch(()=>{});}});
}
function compose(){
  if(!snapshot){feedback('Carregando o estado da fila.');return;}
  if(!snapshot?.redisReady){feedback(snapshot.provisioning?'A fila local está sendo preparada.':'Conecte o Redis em Configurações.',!snapshot.provisioning);return;}
  const form=element('form',undefined,'tf-form');
  const profiles=element('fieldset');profiles.append(element('legend','Contas de destino'));
  for(const account of snapshot.accounts){
    const label=element('label');const input=element('input');input.type='checkbox';input.name='account';input.value=account.id;input.disabled=account.pending;
    label.append(input,document.createTextNode(' '+account.handle+(account.pending?' · reconectar':'')));profiles.append(label);
  }
  if(!snapshot.accounts.length)profiles.append(element('p','Conecte uma conta antes de publicar.'));
  else profiles.prepend(button('Selecionar todas disponíveis',()=>{
    for(const input of profiles.querySelectorAll('input:not(:disabled)'))input.checked=true;
  }));
  const textarea=element('textarea');textarea.maxLength=500;textarea.placeholder='Texto da publicação';textarea.setAttribute('aria-label','Texto');
  const at=element('input');at.type='datetime-local';at.required=true;at.setAttribute('aria-label','Data e hora');
  const preview=element('div',undefined,'tf-preview');const message=element('p');message.setAttribute('role','status');
  const submit=element('button','Agendar','tf-button tf-primary');submit.type='submit';
  attachment=undefined;
  form.append(profiles,textarea,at,element('small','Fuso do Windows · '+snapshot.timezone),button('Selecionar mídia',async()=>{
    try{
      const file=await api.invoke('pick-media');if(!file)return;attachment=file;preview.replaceChildren();
      const item=element(file.type.startsWith('video/')?'video':'img');item.src=file.preview;
      if(item.tagName==='VIDEO')item.controls=true;else item.alt='Prévia da mídia';
      preview.append(item,element('span',file.name),button('Remover mídia',()=>{attachment=undefined;preview.replaceChildren();}));
    }catch(error){message.textContent=error.message;}
  }),preview,message,submit,button('Fechar',()=>dialog.close()));
  const dialog=modal('Nova publicação',form);
  form.onsubmit=async event=>{
    event.preventDefault();submit.disabled=true;
    try{
      const ids=new FormData(form).getAll('account');
      const count=await api.invoke('schedule',{accounts:ids,text:textarea.value,at:new Date(at.value).getTime(),media:attachment?.token});
      dialog.close();feedback(count+' publicação(ões) agendada(s).');await refresh();
    }catch(error){message.textContent=error.message.replace(/^Error invoking remote method '[^']+': Error: /,'');}
    finally{submit.disabled=false;}
  };
}
try{prepare();document.body.classList.add('tf-ready');api.onChange(refresh);void refresh();setInterval(refresh,5000);}
catch(error){document.body.classList.add('tf-ready');main.replaceChildren(element('p','Falha ao abrir a tela: '+error.message));}
