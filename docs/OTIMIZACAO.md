# Estudo de desempenho da publicação (v1.1.0)

Objetivo: entender onde o tempo é gasto ao publicar e quantas contas dá para publicar ao mesmo tempo.

## 1. Onde o tempo ia embora (v1.0.x)

Medido no threads.com com o Microsoft Edge, no PC de desenvolvimento:

| Espera | Tempo |
|---|---|
| Resposta do servidor (`commit`) | ~0,3 s |
| HTML carregado (`domcontentloaded`) | ~1,1 – 1,4 s |
| Conteúdo da página visível | ~1,1 – 1,5 s |
| `networkidle` (rede "parada") | ~4,6 – 5,3 s, e até o limite de 8 s logado |

A v1.0 esperava o `networkidle` em **toda** navegação. O próprio Playwright desaconselha essa espera, porque sites como o Threads nunca param de usar a rede. Isso custava de 3 a 7 s por página. Além disso:

- **Pausas fixas** de 0,4 s, 0,8 s, 1,5 s, 2,5 s e 3 s em vários pontos.
- **Prévia de mídia:** a espera procurava um seletor que podia não existir e então segurava até 20 s + 5 s por arquivo + 60 s por vídeo.
- **Botão de publicar:** quando não era encontrado, a espera ia até o limite de 30 s antes de dar erro. Esse era o caso do botão "Postar".
- **Link do post:** depois de publicar, o app abria o perfil para buscar o link, segurando a vaga da conta por mais 10 s ou mais.
- **Sessões:** cada post abria e fechava uma sessão nova do navegador, mesmo com vários posts da mesma conta em sequência.

## 2. O que mudou na v1.1.0

| Mudança | Efeito medido / esperado |
|---|---|
| Sem `networkidle`: cada etapa espera o elemento que precisa (editor, botão, contadores) | Ler perfil: **~1,9 s** (antes 5–9 s). Ler métricas de um post: **~1,2 s** (antes 5–9 s) |
| Sem pausas fixas; sondagens curtas de 150–250 ms com condição | Cada etapa termina assim que está pronta |
| Botão "Postar" encontrado ou erro em até 8 s | Antes: 30 s + novas tentativas |
| Confirmação = aviso "Postado", link "Ver" ou editor fechado | Libera a conta segundos após o clique |
| Link do post buscado depois, em segundo plano | Não segura mais a fila |
| Um "trabalhador" por conta reaproveita a mesma sessão para vários posts | Sem reabrir o navegador entre posts da mesma conta |
| Intervalo configurável entre posts da mesma conta (padrão 20 s) | Evita rajadas que parecem spam |
| Navegador aquecido ~30 s antes do primeiro post | O lançamento (~1–2 s) não entra no horário |
| **Modo leve:** não baixa imagens, vídeos e fontes do feed | Pico de memória com 8 contas: **1,2 GB** (antes 1,9 GB, −40%) |
| Argumentos do navegador que impedem abas em segundo plano de serem "congeladas" | Contas paralelas não ficam lentas por estarem fora de foco |
| Vagas em paralelo automáticas pela memória do PC | 8 GB → 4 contas, 16 GB → 10 contas (ajustável) |
| Preparação adaptativa: +3 s por conta no mesmo horário | 8 contas no mesmo minuto começam a preparar ~21 s mais cedo |
| Publicação tem prioridade sobre verificação e métricas; tarefas de fundo pulam contas com post nos próximos 10 min | Verificações nunca atrasam um post |
| Tempo por etapa gravado em cada log | Em **Logs → detalhes** aparece, por exemplo: "abrir editor: 2,1 s · texto: 0,2 s · mídia: 1,4 s · botão pronto: 0,3 s · confirmação: 1,8 s" |

## 3. Quantas contas ao mesmo tempo?

Teste com 8 contas e posts no mesmo horário, no PC de desenvolvimento (16 GB):

- **1 conta sozinha:** abre o Threads e chega ao editor em ~3,6 s.
- **8 contas juntas:** a primeira fica pronta em ~12,5 s e a última em ~18 s. O site do Threads é pesado, e as 8 abas disputam o processador.
- **Memória:** ~150 MB por conta no modo leve.

Como a preparação começa 90 s ou mais antes do horário, as 8 contas ficam prontas com folga e todas clicam em "Postar" no horário exato.

**Você com 5 contas + seu amigo com 5 contas:** cada um roda o app no próprio PC, então são duas filas independentes com 5 contas cada. Isso está bem dentro do limite. O que **não** é recomendado é colocar as 10 contas no mesmo PC e no mesmo horário, por dois motivos:

1. Contas acima do número de vagas só começam a preparar depois que a primeira leva publica, saindo de 10 a 20 s mais tarde.
2. Muitas contas publicando do mesmo IP no mesmo segundo é um padrão que plataformas costumam associar a redes de contas coordenadas. Não há números oficiais da Meta sobre isso; a informação vem de fontes secundárias.

Se precisar de 10 contas num só PC, use o intervalo de alguns segundos entre contas (próximo item do roadmap) ou horários levemente diferentes.

## 4. Caminhos estudados e não adotados (por enquanto)

- **API privada do Threads** (endpoints internos como `media/configure_text_only_post`, usados por projetos de engenharia reversa): seria só uma requisição HTTP por post, muito mais rápido. Porém esses endpoints mudam sem aviso, vários projetos foram arquivados, e o uso é mais facilmente identificado como automação. Fica como opção futura, com cuidado.
- **API oficial do Threads:** é o caminho mais escalável. Limite de **250 posts por perfil a cada 24 h**, com carrossel contando como 1. Exige um app na Meta e autorização (OAuth) de cada conta, com renovação do token a cada 60 dias. Descartada por enquanto pela complexidade de autorizar muitas contas.

## 5. Próximos passos sugeridos

1. Testar a v1.1.0 com as contas reais e ler os tempos por etapa nos logs.
2. Se "abrir editor" for a etapa mais lenta, testar abrir pelo botão "Criar" em vez do link de intenção.
3. Opção de espalhar as contas em alguns segundos no mesmo horário (configurável).
4. Atualização automática do app via GitHub Releases.

## Fontes

- Playwright e a espera `networkidle`: [Checkly — Why page.goto() is slowing down your tests](https://www.checklyhq.com/blog/why-page-goto-is-slowing-down-your-playwright-test/), [Biome — noPlaywrightNetworkidle](https://biomejs.dev/linter/rules/no-playwright-networkidle), [BrowserStack — waitUntil](https://www.browserstack.com/guide/playwright-waituntil)
- Contextos e memória: [ZenRows — Playwright BrowserContext](https://www.zenrows.com/blog/playwright-browsercontext), [Railway — 40 contextos paralelos](https://station.railway.com/questions/playwright-browser-pool-mysterious-cras-952b23a0)
- Limites da API oficial: [Meta — Threads API Overview](https://developers.facebook.com/docs/threads/overview), [Meta — Threads Posts](https://developers.facebook.com/docs/threads/posts/)
- Engenharia reversa: [m1guelpf/threads-re](https://github.com/m1guelpf/threads-re), [dmytrostriletskyi/threads-net (arquivado)](https://www.GitHub.com/dmytrostriletskyi/threads-net)
- Limites contra spam: [TechCrunch — Threads rate limits](https://techcrunch.com/2023/07/17/the-spam-bots-have-now-found-threads-as-company-announces-its-own-rate-limits), [Geelark — sinais de vínculo entre contas (fonte secundária)](https://www.geelark.com/blog/threads-account-banned/)
