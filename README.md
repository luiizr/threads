# ThreadFlow

Agendador local de publicações do Threads para Windows x64. A interface é baseada nos arquivos HTML do Stitch preservados em `stitch_threads_multi_account_manager/`. O aplicativo usa Electron, Playwright e uma fila BullMQ no Redis.

## Usar o instalador

Abra o `ThreadFlow Setup` para instalar. Na primeira execução, entre em **Configurações** e escolha **Preparar Redis neste computador**. Essa etapa baixa o Redis para Windows, verifica o SHA-256 e inicia a instância local. Também é possível informar o endereço de um Redis existente.

Em **Contas**, clique em **Conectar conta**, faça login no Threads na janela do Edge ou Chrome e clique em **Salvar e verificar sessão**. Em **Publicações**, selecione os perfis e marque a data e a hora. O computador precisa estar ligado, conectado e com o ThreadFlow ativo no horário da postagem. Fechar a janela oculta o app na bandeja. O item **Sair do ThreadFlow** da bandeja encerra o processamento.

## Rodar a partir dos arquivos do GitHub

1. No GitHub, abra **Code → Download ZIP** e extraia o ZIP em uma pasta própria. Entre na pasta extraída que contém `package.json`.
2. No Windows x64, tenha Node.js 22.12+ com npm, Microsoft Edge ou Google Chrome, e internet para instalar dependências e acessar o Threads.
3. No PowerShell ou no Prompt, execute:

```text
npm ci
npm run design
npm start
```

Para montar o instalador Windows, execute `npm run dist`. O executável é gerado em `release/`.

## Testes locais

`node verify-threads.mjs` usa o Edge ou Chrome e uma página simulada para testar confirmação de perfil, abertura lenta do editor e publicação, sem enviar conteúdo ao Threads.

Para `node verify-redis.mjs` e `node verify-desktop.mjs`, obtenha o pacote [Redis 8.2.10 para Windows (MSYS2)](https://github.com/redis-windows/redis-windows/releases/tag/8.2.10) e extraia-o para `redis-test/Redis-8.2.10-Windows-x64-msys2/`. O SHA-256 esperado para o ZIP está em `src/managed-redis.js`. Os testes usam dados temporários e uma instância local do Redis.
