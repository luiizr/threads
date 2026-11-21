import fs from 'node:fs/promises';
import vm from 'node:vm';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
const source=new URL('./stitch_threads_multi_account_manager/',import.meta.url);
const dest=new URL('./src/ui/',import.meta.url);
await fs.mkdir(dest,{recursive:true});
const names={welcome:'boas_vindas',overview:'m_tricas',accounts:'contas',posts:'publica_es',logs:'logs',settings:'configura_es'};
const renderer=await fs.readFile(new URL('renderer.js',dest),'utf8');
for(const [route,name] of Object.entries(names)){
 let html=await fs.readFile(new URL('threadflow_'+name+'/code.html',source),'utf8');
 const config=html.match(/<script id="tailwind-config">([\s\S]*?)<\/script>/)?.[1];
 if(!config)throw Error(name+': Tailwind ausente');
 const scope={tailwind:{}};
 vm.runInNewContext(config,scope,{timeout:1000,contextCodeGeneration:{strings:false,wasm:false}});
 const theme=JSON.parse(JSON.stringify(scope.tailwind.config));
 const {css}=await postcss([tailwind({...theme,content:[{raw:html},{raw:renderer}]})])
  .process('@tailwind base; @tailwind components; @tailwind utilities;',{from:undefined});
 html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/\s+on\w+=(?:"[^"]*"|'[^']*')/gi,'')
  .replace(/<img\b[^>]*>/gi,'')
  .replaceAll('2. Conectar com a API Oficial do Threads','2. Conectar uma conta do Threads')
  .replaceAll('Conexão direta e segura com a API oficial da Meta. Seu navegador padrão abrirá a tela de consentimento e o token de longa duração será criptografado localmente no Keychain do sistema.','O ThreadFlow abre o Threads em uma janela isolada do navegador. Entre manualmente e salve a sessão no aplicativo.')
  .replaceAll('Seus tokens nunca passam por nossos servidores. Nem temos servidores de coleta.','As sessões são criptografadas e armazenadas neste computador.')
  .replaceAll('Gerencie autenticações seguras, permissões locais por OAuth2 e monitore cotas de publicações diárias sem intermediários de nuvem.','Conecte e verifique os perfis do Threads que serão usados nos agendamentos.')
  .replaceAll('Frequência com que o app consulta a API oficial do Threads para validar tokens de acesso e atualizar métricas de engajamento.','A verificação abre a sessão do Threads em um navegador isolado. Você pode verificar cada perfil na tela Contas.')
  .replaceAll('Em conformidade estrita com as diretrizes de rate limit e limites por aplicativo da Meta Graph API v1.0.','A fila verifica a sessão antes de tentar publicar no Threads.')
  .replaceAll('Envia lembrete antes que o token de 60 dias expire para evitar pausas em posts agendados.','Opção indisponível nesta versão. Contas que precisam de reconexão aparecem na tela Contas.')
  .replaceAll('Verificação de Contas &amp; API','Verificação de sessões do Threads')
  .replaceAll('Logs &amp; Diagnósticos da API','Logs e diagnósticos')
  .replaceAll('macOS &amp; Windows Desktop Client','Aplicativo para Windows')
  .replaceAll('Conformidade total com as diretrizes e limites da plataforma Meta.','A sessão fica vinculada ao perfil escolhido no Threads.')
  .replaceAll('Regras de disparo, espaçamento dinâmico e mitigação de bloqueios ou rate limits da Meta.','Configurações de execução dos agendamentos.')
  .replaceAll('Recupera publicações caso ocorra perda rápida de Wi-Fi ou timeout na resposta da Meta.','Se o envio ficar sem confirmação, confira a publicação diretamente no Threads.')
  .replace(/API Threads Meta|API Meta|API da Meta/gi,'Playwright')
  .replace(/(?:Meta|Threads) Graph API v1\.0|Meta OAuth 2\.0 PKCE|API Oficial Threads/gi,'Playwright · navegador local')
  .replace(/OAuthException|OAuth Token HTTP 401|OAuth \/ Token|API oficial|Threads Graph API/gi,'Sessão do Threads')
  .replace(/expiração de token|token expirado|token revogado/gi,'sessão expirada')
  .replace(/<span\b[^>]*>badge<\/span>(?=\s*<input\b[^>]*id="username-input")/i,'<svg class="tf-name-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M6.5 15c0-1.4 1.1-2.3 2.5-2.3s2.5.9 2.5 2.3M14 9h3M14 13h3"/></svg>')
  .replace('<head>',`<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src data:; media-src data:; base-uri 'none'; form-action 'none'"><link rel="stylesheet" href="${route}.css"><link rel="stylesheet" href="app.css">`)
  .replace(/<body\b/, `<body data-route="${route}"`).replace('</body>','<script src="renderer.js"></script></body>');
 await fs.writeFile(new URL(route+'.html',dest),html);
 await fs.writeFile(new URL(route+'.css',dest),css);
}
