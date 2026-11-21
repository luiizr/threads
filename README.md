# ThreadFlow

Agendador local para várias contas do Threads, no Windows. Ele publica pelo Microsoft Edge (ou Chrome) já instalado no PC, controlado pelo Playwright.

## Para quem vai usar

1. Execute o `ThreadFlow-Setup-1.0.0.exe` com dois cliques. Ele instala, cria o atalho e abre o app.
   - Como o instalador ainda não é assinado digitalmente, o Windows pode mostrar "O Windows protegeu o computador". Clique em **Mais informações → Executar assim mesmo**.
2. Digite seu nome e clique em **Conectar conta**. Abre uma janela do Edge no login do Threads: entre na conta normalmente. A janela fecha sozinha quando o login termina. Repita para cada conta.
3. Em **Agendar**, escreva o post, anexe as mídias, marque as contas e escolha o horário.
4. Fechar a janela não para o app: ele fica no ícone perto do relógio e abre junto com o Windows.

O computador precisa estar ligado e com internet no horário dos posts.

## Como funciona

- **Sessões:** cada conta tem um arquivo de sessão criptografado com a DPAPI do Windows em `%APPDATA%\ThreadFlow\data\sessions`. A senha nunca passa pelo app.
- **Paralelismo:** um único processo do Edge, com um contexto isolado por conta. Posts no mesmo horário saem juntos, respeitando o limite "Contas publicando ao mesmo tempo" (padrão 3). Uma mesma conta nunca faz duas tarefas ao mesmo tempo.
- **Preparação antecipada:** cerca de 90 s antes do horário, o app abre o editor, escreve o texto e anexa as mídias. No horário exato, só clica em Publicar.
- **Falhas:** tentativas automáticas após 1, 5 e 15 min. Se a sessão expirar, a conta fica como "Desconectada" e os posts dela esperam a reconexão. Cada erro gera um log com captura de tela.
- **Métricas:** a cada 2 h o app visita os posts dos últimos 30 dias e lê visualizações, curtidas, respostas, reposts e compartilhamentos, além dos seguidores do perfil.

## Quando o Threads mudar o site

Os textos e rótulos usados para encontrar botões ficam em `src/main/selectors.ts`. Para corrigir sem gerar uma versão nova, crie `%APPDATA%\ThreadFlow\data\selectors.json` só com as chaves que mudaram, por exemplo:

```json
{ "postButton": ["Publicar", "Post", "Compartilhar"] }
```

## Desenvolvimento

```powershell
npm install
npm run dev        # abre o app em modo desenvolvimento
npm run typecheck
npm run dist       # gera dist\ThreadFlow-Setup-<versão>.exe
```

O NSIS não aceita caminhos muito longos (acima de ~260 caracteres). Se a pasta do projeto tiver um caminho grande, empacote a partir de uma letra de unidade curta (compile antes, no caminho normal):

```powershell
subst T: .
cd T:\
npm run dist
cd C:\
subst T: /d
```

### Estrutura

| Pasta | O que tem |
|---|---|
| `src/main/threads.ts` | Automação do Threads: login, verificação, publicação, métricas |
| `src/main/scheduler.ts` | Fila, paralelismo, tentativas, verificação periódica |
| `src/main/browser.ts` | Edge/Chrome, contextos por conta, sessões criptografadas |
| `src/main/actions.ts` | Contas, criação e edição de posts, cópia das mídias |
| `src/main/index.ts` | Janela, bandeja, início com o Windows, IPC |
| `src/renderer/src/pages` | Telas: Métricas, Contas, Agendar, Publicações, Logs, Configurações |
| `tests/` | Testes locais: `flow.mjs` (fila), `flow-parallel.mjs` (várias contas + memória), `probe4.mjs` (funções contra o site real), `seed.mjs`/`shots2.mjs` (telas com dados fictícios) |
| `docs/OTIMIZACAO.md` | Estudo de desempenho: medições, o que mudou, capacidade |
