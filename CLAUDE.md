## Diretrizes de Otimização e Performance (Web — HTML/CSS/JS, sem engine)

Ao escrever, refatorar ou sugerir arquitetura para este projeto, atue como um engenheiro de performance web especializado em jogos que rodam 100% no navegador, sem motor externo (Godot, Unity, etc). O projeto usa HTML, CSS e JavaScript puro (bibliotecas leves como PixiJS/Three.js ou WASM só entram se explicitamente aprovado — ver Pilar 0). Sempre que precisar confirmar comportamento de uma API, suporte de navegador, ou um benchmark real, pesquise antes de afirmar algo — não assuma comportamento de spec sem checar a implementação real nos navegadores-alvo definidos neste documento.

### 0. Baseline de Navegadores-Alvo e Confirmação Obrigatória de Arquitetura
- Antes de tudo, este documento deve declarar quais navegadores/dispositivos são o alvo (ex: "Chrome/Edge/Firefox/Safari últimas 2 versões, desktop + mobile"). Toda decisão de otimização deve respeitar essa baseline.
- **Nunca escolha sozinho a abordagem de renderização ou de threading sem confirmar com o usuário.** Antes de implementar, apresente as opções com trade-offs reais e peça confirmação. Exemplos de decisões que exigem confirmação:
  - **DOM+CSS vs `<canvas>` (2D) vs WebGL vs WebGPU:** DOM+CSS é ótimo até algumas centenas de nós, mas recalculo de estilo e layout explode com muitas entidades; Canvas 2D é simples e roda na CPU/GPU dependendo do browser; WebGL é suportado universalmente e acelerado por GPU; WebGPU é o mais rápido e moderno (já estável em Chrome, Edge, Firefox e Safari desde 2025/2026), mas ainda exige *fallback* para navegadores/dispositivos sem suporte (Android mais antigo, Linux em alguns casos).
  - **Uso de Web Workers + `OffscreenCanvas`:** vale a pena quando o trabalho de física/IA/renderização é pesado o bastante para justificar a complexidade extra de `postMessage`/objetos transferíveis.
  - **`SharedArrayBuffer` + `Atomics`:** exige que o servidor envie os headers `Cross-Origin-Opener-Policy: same-origin` e `Cross-Origin-Embedder-Policy: require-corp` (isolamento cross-origin). **Confirme se o ambiente de hospedagem final suporta headers customizados antes de projetar a arquitetura em cima disso** — em muitos hosts estáticos isso não é trivial.
  - **WebAssembly com threads:** é a válvula de escape para o pior caso de CPU (física massiva, pathfinding pesado). Só sugira depois de provar, com profiling, que JS puro não dá conta — é uma dependência de build extra (Emscripten/Rust) e exige o mesmo isolamento cross-origin do item acima, além de fallback single-thread via `wasm-feature-detect`.
  - Uso de qualquer biblioteca externa (PixiJS, Three.js, Comlink, etc).

### 1. Gerenciamento de Memória (Tolerância Zero ao Garbage Collector)
- **Object Pooling é obrigatório** para qualquer entidade recriada com frequência (hordas, projéteis, partículas, efeitos). Nunca crie/destrua objetos (`{}`, `[]`, closures) dentro do game loop — pré-aloque e reutilize.
- **TypedArrays para dados numéricos em massa:** `Float32Array`, `Int32Array`, etc. em vez de arrays comuns de objetos para posições, velocidades, vida, etc. Isso evita boxing, melhora localidade de cache e reduz pressão no GC.
- **Structure of Arrays (SoA) > Array of Structures (AoS)** para sistemas com muitas entidades (estilo ECS): array de posições X separado de array de posições Y, em vez de array de objetos `{x, y}`. Melhora cache locality e permite iteração em TypedArrays.
- **Cuidado com "hidden class deopt" (V8 e derivados):** mantenha objetos com a mesma "forma" (mesmas propriedades, na mesma ordem, criadas sempre do mesmo jeito). Evite `delete obj.prop`, adicionar propriedades depois da criação, ou misturar tipos na mesma propriedade — isso desotimiza o motor JS.
- Evite `try/catch`, `arguments`, closures criadas por frame, e `.forEach`/`.map`/`.filter` dentro de loops quentes (`update`/`render`) — prefira `for` clássico, que tem overhead de chamada menor.
- Reutilize buffers temporários (ex: vetores de cálculo intermediário) em vez de alocar `new Vector(...)` a cada operação.

### 2. Delegação Total de Trabalho Gráfico para a GPU
**CPU só deve orquestrar; GPU deve desenhar.** A regra geral: se algo pode ser expresso como transformação, blend ou shader, isso não deve custar CPU a cada frame.

- **CSS:**
  - Anime **apenas** `transform` e `opacity` — são as únicas propriedades que o compositor pode animar sem re-layout/re-paint na main thread. Evite animar `top/left/width/height/margin`.
  - Use `will-change` com moderação: promover um elemento a sua própria layer de GPU tem custo de memória. Aplique só em elementos que realmente vão animar, e remova depois (ou aplique/remova dinamicamente), para não gerar "explosão de layers".
  - Use `contain: layout paint style` e `content-visibility: auto` (já suportado em todos os browsers principais, incluindo Safari 18+) com `contain-intrinsic-size` para elementos fora da viewport — o browser pula layout/paint até precisar.
  - Evite **layout thrashing**: nunca intercale leitura (`offsetWidth`, `getBoundingClientRect`) e escrita de DOM no mesmo loop. Leia tudo, depois escreva tudo (padrão FastDOM).
  - Efeitos como `filter`, `box-shadow` grandes e `backdrop-filter` são compositáveis mas caros em *fill-rate* — evite aplicar em muitos elementos simultâneos ou em elementos grandes/animados.
  - Acima de algumas centenas de sprites/entidades visuais simultâneas, DOM+CSS deixa de escalar bem (custo de recálculo de estilo cresce com o nº de nós). Nesse ponto, migre a renderização para `<canvas>`.

- **Canvas 2D / WebGL / WebGPU:**
  - Altos gráficos, alta performance: Os visuais/graficos NÃO devem ser sacrificados em prol da performance. O foco é ser genial, usar matemática, jogar trabalho para GPU e fazer excelentes otimizações para garantir que mesmo com super visuais, rode liso, tanto em computadores como celulares.
  - Minimize *draw calls*: use spritesheets/texture atlas em vez de várias texturas soltas; agrupe (batch) desenhos que compartilham material/textura.
  - Use *instancing* para desenhar muitas cópias do mesmo objeto (hordas, projéteis) em uma única chamada: `ANGLE_instanced_arrays`/instancing nativo do WebGL2, ou *render bundles* do WebGPU (podem chegar a ~10x mais rápido que comandos remontados a cada frame, segundo a própria documentação do WebGPU).
  - Nunca leia dados de volta da GPU no meio do frame (`gl.readPixels`, etc.) — isso força sincronização CPU↔GPU e trava o pipeline.
  - Evite recompilar shaders/recriar pipelines em runtime; monte tudo no setup.
  - Ao usar WebGPU, sempre implemente feature detection com fallback em cadeia: WebGPU → WebGL2 → WebGL → Canvas2D, conforme o que o navegador do usuário suportar.

### 3. Multithreading Real e Main Thread Livre
A main thread é o recurso mais escasso do navegador — ela cuida de input, layout, paint e boa parte do JS. Nada deve ocupá-la desnecessariamente. Crie uma classe inteira para gerenciamento de Multi-thread absurdamente robusta para centenas de situações para não poluir código com coisas repetidas.

- **Web Workers** para tudo que for CPU-bound e não precisar de DOM: física, IA, pathfinding, geração procedural, parsing pesado. Dimensione o pool de workers com base em `navigator.hardwareConcurrency` (geralmente `hardwareConcurrency - 1`, deixando um núcleo livre pra main thread/browser).
- Ao trocar dados com Workers, use **objetos transferíveis** (`ArrayBuffer` via `postMessage(data, [buffer])`) em vez de deixar o `structured clone` copiar tudo — transferência é O(1), cópia não.
- **`OffscreenCanvas`** (já baseline em todos os navegadores modernos) permite mover o desenho inteiro pra dentro de um Worker via `canvas.transferControlToOffscreen()`, liberando a main thread até de chamadas de render.
- **`SharedArrayBuffer` + `Atomics`** permitem memória compartilhada sem cópia entre main thread e Workers (útil para posições de entidades atualizadas em paralelo), mas exigem os headers de isolamento cross-origin citados no Pilar 0. Nunca desenhe nessa arquitetura sem confirmar que o deploy suporta isso.
- **Nunca bloqueie a main thread com uma tarefa longa (>50ms).** Quebre trabalho pesado em pedaços usando `scheduler.postTask`/`scheduler.yield` (mais moderno, prioridade explícita) ou `requestIdleCallback` como alternativa (com fallback de `setTimeout` para navegadores sem suporte — confirme o status atual, pois isso muda). Use `navigator.scheduling.isInputPending()` quando disponível para ceder o controle assim que houver input pendente.
- **Loop de jogo:** use `requestAnimationFrame` para o render, sincronizado com a taxa de atualização da tela — nunca `setInterval`/`setTimeout` para isso. Para física/lógica, desacople do framerate com **timestep fixo + acumulador** (padrão "Fix Your Timestep"), garantindo determinismo independente da taxa de frames do dispositivo.
- **Meça antes de otimizar:** use o painel Performance do DevTools (peça para o usuário entregar imagens se não tiver acesso), `performance.now()` e a Long Animation Frames API (LoAF) pra achar o gargalo real antes de aplicar qualquer técnica acima — não otimize às cegas.

### 4. Níveis de Otimização vs. Legibilidade
- **Alto e Médio Nível (sempre):** arquitetura limpa, boas práticas de JS/CSS modernas, aplicadas de forma constante.
- **Baixo Nível (quando necessário, mas ainda comum):** TypedArrays, SoA, bitmasks para flags/estado, aplicados sempre que houver listas grandes de dados ou muitas entidades.
- **Baixíssimo Nível (só em gargalo comprovado):** truques de *bitwise*, desenrolamento manual de loop, micro-otimizações que prejudicam a leitura do código só devem entrar em pontos comprovadamente críticos via profiling. **Não sacrifique legibilidade por ganho marginal não vital.**

### 5. Matemática Criativa contra Força Bruta
- Antes de sugerir uma solução O(n²) (ex: checar colisão de cada entidade contra todas as outras em hordas), avalie ativamente uma alternativa matemática/estrutural mais barata:
  - **Particionamento espacial** (grid uniforme, quadtree, spatial hashing) para reduzir checagens de colisão/proximidade de O(n²) para próximo de O(n).
  - **Distância ao quadrado** em vez de `Math.sqrt` sempre que só for necessário comparar distâncias (sqrt é evitável na maioria dos casos de "está mais perto que X?").
  - **Bitmasks** para flags de estado em vez de múltiplos booleanos ou comparações de string.
  - Potências de 2 para dimensões de grid/textura, permitindo trocar módulo/divisão por operações bitwise quando fizer diferença real.
  - Tabelas de lookup pré-computadas (ex: senos/cossenos) só se o profiling mostrar que `Math.sin/cos` é de fato o gargalo — motores JS modernos já otimizam isso bem na maioria dos casos.
- A solução matemática só entra se for **elegante e correta**: nunca corte caminho lógico às custas de quebrar o comportamento esperado da mecânica.

### 6. Pesquisa Proativa
Sempre que for projetar algo relacionado a performance e não tiver certeza absoluta sobre suporte de navegador, comportamento específico de uma API (`content-visibility`, `scheduler.postTask`, WebGPU, etc.) ou uma issue conhecida, **pesquise antes de recomendar** — esse tipo de informação muda com frequência entre versões de navegador.

### 7. Modularização de Código Robusta
- **ES Modules nativos** (`import`/`export`) em todo o projeto — nada de scripts soltos concatenados ou variáveis penduradas em `window`.
- **Separação estrita de responsabilidades** em pastas/módulos claros, por exemplo: `/core` (game loop, timestep fixo, estado global), `/systems` (physics, ai, input, audio, render — um arquivo por sistema), `/entities` ou `/components` (dados puros), `/render` (backends intercambiáveis: `canvas2d.js`, `webgl.js`, `webgpu.js`), `/workers` (scripts isolados que rodam fora da main thread), `/utils`, `/config` (constantes centralizadas).
- **Nenhum "God File"/"God Object":** um módulo = uma responsabilidade. Se um arquivo cresce sem controle ou passa a misturar lógica de jogo com lógica de renderização/DOM, é sinal de quebrar em módulos menores.
- **Abstraia a camada de renderização atrás de uma interface comum** (ex: `init(canvas)`, `draw(scene)`). Assim, trocar Canvas2D → WebGL → WebGPU (Pilares 0 e 2) exige só trocar a implementação por trás da interface, sem tocar em lógica de jogo/física.
- **Separe dados de comportamento** sempre que fizer sentido (estilo ECS leve): sistemas operam sobre arrays de dados (SoA/TypedArrays do Pilar 1), em vez de métodos presos a classes de entidade. Isso também facilita mover um sistema inteiro pra dentro de um Worker sem arrastar dependência de DOM/render junto.
- **Contratos de mensagem explícitos** entre main thread e Workers: tipar/documentar cada mensagem trocada via `postMessage` (ex: `{ type: 'UPDATE_POSITIONS', buffer }`), nunca strings mágicas soltas ou payloads implícitos.
- **Evite dependências circulares.** Se dois sistemas precisam se comunicar, prefira um barramento de eventos central (event bus/pub-sub) em vez de imports cruzados diretos entre eles.
- **Centralize configuração e constantes** num único `config.js`/`constants.js` — nunca números mágicos espalhados pelo código.
- **Lógica de jogo pura** (sem efeito colateral de DOM/canvas) sempre que possível, permitindo testar a simulação isoladamente da camada visual.
- **Documente contratos de módulo com JSDoc** (tipos de entrada/saída de cada função pública), mesmo sem TypeScript — mantém a legibilidade e evita acoplamento acidental conforme o projeto cresce.

### 8. Multiplayer (2 Jogadores) — Rede, Sincronização e Conexão por Código de Sala
A rede deve ser tratada como um recurso escasso e não-confiável por padrão: latência variável, perda de pacote e queda de conexão **vão** acontecer. O objetivo é mandar o mínimo de dado necessário, da forma mais barata possível, e nunca deixar o jogo travar silenciosamente quando a rede falhar.

**Otimização do que trafega na rede:**
- Envie **binário, não JSON.** Use `ArrayBuffer`/`DataView` (ou um serializador binário leve) para o payload de cada pacote — `JSON.stringify` de números como texto desperdiça bytes e CPU de parsing.
- Envie **deltas, não estado completo:** só inclua no pacote os campos que mudaram desde o último snapshot (dirty flags por entidade/campo), nunca o objeto de estado inteiro a cada tick.
- **Quantize valores contínuos:** posições/rotações em `float32` geralmente não precisam de toda essa precisão pela rede — converter para `int16` com uma escala fixa (fixed-point) já reduz o payload pela metade ou mais, sem impacto visual perceptível.
- **Separe a taxa de envio da taxa de renderização.** Não mande um pacote por frame (`requestAnimationFrame`) — defina uma taxa de tick de rede fixa e mais baixa (ex: 15–30 Hz) e agrupe várias mudanças em um único pacote por tick, em vez de vários pacotes pequenos.
- **Use canais diferentes por criticidade de dado:** um canal *unreliable/unordered* (`ordered:false, maxRetransmits:0` em `RTCDataChannel`) para dados de alta frequência e descartáveis (posição, mira) — não vale a pena retransmitir um frame de posição atrasado, o próximo pacote já corrige. Reserve um canal *reliable/ordered* só para eventos discretos e críticos (troca de fase, pontuação, pickup de item, fim de partida).
- Só adicione compressão/bit-packing adicional (enums em bits, flags empacotadas) se o profiling mostrar que o tamanho do pacote é de fato o gargalo — não precoceça isso sem medir.

**Arquitetura de simulação (esconder latência sem gerar desync):**
- **Predição no cliente + reconciliação:** aplique o input do próprio jogador localmente e imediatamente (sem esperar confirmação da rede), e corrija/realinhe suavemente se o estado autoritativo divergir do que foi previsto.
- **Interpolação/extrapolação para entidades remotas:** nunca "teleporte" o outro jogador para a posição do último pacote recebido — interpole suavemente entre o último estado conhecido e o novo ao longo do tempo esperado entre pacotes.
- **Defina um host autoritativo.** Em uma partida de 2 jogadores sem servidor dedicado, o jeito mais simples e robusto de evitar desync é eleger um dos dois peers (geralmente quem cria a sala) como fonte de verdade do estado do jogo: o outro peer só envia *inputs*, nunca estado. Isso evita o problema clássico de dois lados calculando o jogo em paralelo e divergindo (muito mais simples que lockstep determinístico bidirecional).
- **Detecte desync cedo:** envie periodicamente um checksum/hash leve do estado do jogo. Se os hashes dos dois peers divergirem, dispare uma resincronização completa a partir do host em vez de deixar o erro acumular silenciosamente ao longo da partida.

**Robustez de conexão (quedas, timeout, reconexão):**
- Implemente **heartbeat/ping** periódico entre os peers; se não houver resposta dentro de um timeout definido, trate como conexão instável antes de declarar desconexão total.
- Ao detectar lag/instabilidade momentânea, prefira um **"soft pause"** (avisa o jogador, congela a simulação, tenta recuperar) em vez de encerrar a partida no primeiro sinal de problema.
- Implemente **reconexão automática pelo mesmo código de sala** sempre que possível, para cobrir quedas rápidas de wifi/4G sem obrigar os dois jogadores a recomeçar do zero.
- Trate e exiba explicitamente cada estado de conexão pro usuário (`conectando…`, `sala aguardando o 2º jogador…`, `reconectando…`, `conexão perdida`) — nunca deixe a UI travada sem feedback esperando um peer que já caiu.

**A melhor opção gratuita e estável para conexão por código de sala (pesquisado):**
- **Recomendação principal: Trystero.** É uma biblioteca JS feita exatamente para esse caso — conecta dois navegadores via **WebRTC P2P real** (dado do jogo trafega direto entre os jogadores, criptografado, sem servidor no meio) usando redes públicas já existentes só como canal de sinalização inicial (o padrão é rastreadores BitTorrent, 100% gratuito, sem conta, sem servidor pra manter). O "código de sala" é literalmente o parâmetro de sala da API (`joinRoom(config, roomCode)`) — gere um código curto e aleatório (ex: 5–6 caracteres) pros jogadores compartilharem. Também suporta senha opcional na sala, pra garantir que só quem tem o código entra, mesmo o canal de sinalização sendo público.
  - **Caveat real encontrado na pesquisa:** a conexão inicial via WebRTC pode levar de alguns segundos até ~10s em redes mais hostis, e NATs muito restritivos (redes corporativas, alguns 4G) podem falhar na conexão direta P2P sem um servidor **TURN** de relay. Trate isso na UI (estado "conectando…" citado acima) e, se a taxa de falha de conexão for um problema real em produção, configure um TURN de fallback — **Open Relay Project (metered.ca)** oferece 20 GB/mês grátis, o que é mais que suficiente pra um jogo de dados (não vídeo) 2P. Confirme na documentação atual do Trystero como injetar `rtcConfig`/servidores ICE customizados antes de implementar, já que a API pode mudar.
- **Alternativa (se precisar de mais confiabilidade/autoridade central):** um relay WebSocket simples via **Cloudflare Workers + Durable Objects (PartyKit)**, que roda globalmente na borda e tem tier gratuito. Troca a simplicidade "zero-backend" do Trystero por uma conexão que sempre funciona (WebSocket através de um servidor público nunca sofre com NAT restritivo) e por ter um ponto central mais fácil de tratar como autoridade do jogo — ao custo de exigir deploy de um pequeno backend e adicionar a latência do relay (geralmente irrelevante pra um jogo casual 2P).
- **Confirme com o usuário qual caminho seguir** antes de implementar (ver Pilar 0): Trystero P2P puro (mais simples, zero custo de servidor, latência mínima, mas depende de sinalização de terceiros e pode falhar em NATs raros) vs. relay via WebSocket hospedado (mais confiável e centralizado, exige manter/deployar um backend, ainda que gratuito).

### 9. Estrutura do Sistema (Arquitetura Atual)
Para manter o projeto organizado e modular, a base de código é estritamente dividida por responsabilidades (seguindo o Pilar 7). O jogo é **servidor autoritativo**: o Host roda o servidor (`/src/server/`) e também é o cliente do assento P1; o convidado (ou a CPU) é o assento P2. Os dois clientes recebem exatamente o mesmo tipo de mensagem.

**Raiz do Projeto:**
- `/index.html`: Ponto de entrada. Menu, modal de sala, HUD (HP, botão Finalizar Turno, mensagens de fase, banner de conexão) e telas de vitória/derrota.
- `/style.css`: Estilização pura, layouts Flex/Grid, e micro-animações visuais aceleradas por hardware (`transform`, `opacity`).
- `/debug.js`: Harness Puppeteer/Express para abrir o jogo headless e capturar o console.

**Configurações, Core e Utilitários (`/src/config/`, `/src/core/`, `/src/utils/`):**
- `/src/config/constants.js`: Todas as constantes centralizadas (regras numéricas, cores como índices, tempos de cinemática do servidor `TIMINGS` e do cliente `ANIM`, rede, IA).
- `/src/core/game-loop.js`: "Fix Your Timestep" para separar lógica da renderização.
- `/src/core/viewport.js`: Resolução virtual (1600x1040 de referência) com escala uniforme para qualquer tela/zoom/celular. Todo o jogo trabalha em coordenadas virtuais; a HUD acompanha via `--ui-scale`.
- `/src/core/event-bus.js`: Barramento global Pub/Sub (disponível para desacoplar sistemas).
- `/src/core/thread-manager.js`: Pool robusto de Web Workers (ainda não registrado: a simulação atual é leve).
- `/src/utils/zones.js`: Zonas das cartas (baralho, descarte, mão/ataque/defesa/uso por assento). Absolutas no servidor, relativas (`SELF_*`/`OPP_*`) na rede e no cliente; `mirrorZone()` converte entre as duas.

**Servidor Autoritativo (`/src/server/`) — roda só no Host:**
- `/src/server/server-state.js`: Estado da partida em SoA/TypedArrays; cada carta vive em exatamente uma zona.
- `/src/server/server-engine.js`: Fases (sorteio de cor, preparação, descarte por limite/doação, descarte forçado, fim de jogo), validação de todo input, envio de snapshots por jogador e eventos (`emit` para ambos, `emitTo` para um só).
- `/src/server/server-combat.js`: Resolução completa do combate (clash, empate, defesa, +2/+4 em cadeia, Block, Reverso, dano direto, retorno à mão).

**Entidades / Dados (`/src/entities/`):**
- `/src/entities/card-pool.js`: Visão renderizável do cliente, indexada pelo id da carta do servidor (SoA/TypedArrays, capacidade fixa, zero GC por frame).

**Sistemas (`/src/systems/`):**
- `/src/systems/rules.js`: Regras puras (cor jogável, choque numérico, classificação de choques especiais, limite de mão, compras da rodada). Usadas por servidor, cliente, IA e Worker.
- `/src/systems/deck-system.js`: Baralho autoritativo (sorteio da face na compra, reciclagem do descarte).
- `/src/systems/board-system.js`: Geometria dos slots na perspectiva local.
- `/src/systems/layout-system.js`: Posição de repouso de cada carta (mãos em leque, pilhas, baralho).
- `/src/systems/input-system.js`: Pointer Events (mouse/toque) com drag & drop; só repassa intenções.
- `/src/systems/ai-system.js`: A CPU. É um cliente de verdade: faz handshake, lê apenas o próprio snapshot (cartas do oponente mascaradas) e envia inputs. Também é o piloto do modo `?autoplay`.

**Cliente (`/src/client/`):**
- `/src/client/game-client.js`: O jogador local. Fila única e ordenada de snapshots/eventos do servidor (cada cinemática termina antes do próximo item), previsão local com reconciliação pelo `ack` do snapshot, input e HUD derivada do estado autoritativo.

**Rede / Multiplayer (`/src/network/`):**
- `/src/network/protocol.js`: Contratos de mensagem (`MSG`, `INPUT`, `EVENT`) e o codec binário do snapshot por jogador.
- `/src/network/network-system.js`: Camada de sessão: papéis Host/Client, handshake `HELLO`/`WELCOME` com token (reconexão pelo mesmo link, recusa de 3º jogador), heartbeat, estados de conexão e roteamento por assento.
- `/src/network/network-adapter.js`: Contrato de transporte (connect, send, ping, callbacks de par).
- `/src/network/adapters/trystero-adapter.js`: WebRTC P2P via Trystero (sinalização MQTT pública, versão fixada, carregado sob demanda).
- `/src/network/adapters/local-cpu-adapter.js`: "Rede" em memória entre o Host e a IA, com latência simulada.

**Renderização / Interface (`/src/render/`, `/src/ui/`):**
- `/src/render/canvas2d-renderer.js`: Desenha tabuleiro, pilha do baralho, cartas e partículas (`draw(scene, dt)`).
- `/src/render/animator.js`: Tweens sem Tween Fighting; `toAsync()` nunca trava (timeout de segurança).
- `/src/render/cinematic-player.js`: Converte eventos do servidor em animações (revelar, choque, invocação, dano direto, fim de jogo).
- `/src/render/particle-system.js`: Partículas em TypedArrays.
- `/src/ui/hud.js`: Única camada que mexe no DOM da interface.

**Áudio (`/src/audio/`, `/assets/audio/`):**
- `/src/audio/audio-engine.js`: Fachada única de áudio (`App.audio`). Ciclo de vida do `AudioContext` (liberação no 1º gesto, aba oculta, interrupções do iOS), barramentos master/music/sfx/ui com limitador, teto de vozes, sons sintetizados (`play`), samples curtos (`loadSample`/`playSample`) e faixas por streaming (`createTrack`, `music`).
- `/src/audio/synth.js`: Sintetizador declarativo (`SoundSpec`: camadas tone/noise/FM, envelopes, glissandos, filtros, vibrato/tremolo, distorção, eco, sequências de notas). Valida presets no registro.
- `/src/audio/audio-track.js`: Arquivo tocado por streaming com controle total (play/pause/stop com fade, seek, tempo, loop, velocidade, eventos).
- `/src/audio/music-player.js`: Faixas nomeadas com crossfade automático.
- `/src/audio/audio-sources.js`: Escolhe a 1ª fonte de áudio suportada pelo navegador (fallbacks por formato).
- `/src/config/sound-presets.js`: Biblioteca de sons sintetizados (dados puros) e o enum `SFX`.
- `/assets/audio/music/`: Músicas (caminhos em `CONFIG.AUDIO.MUSIC`).

**Bootstrap:**
- `/src/main.js`: Menu, criação de sala (Host = servidor + cliente P1), entrada por `?room=CODIGO` (cliente P2) e modo CPU. Parâmetros de depuração: `?debug` expõe `window.__yugi`; `?autoplay` deixa a IA jogar pelo jogador local.

**Workers (`/src/workers/`):**
- `/src/workers/game-worker.js`: Ponto de entrada pronto para mover regras pesadas para fora da main thread via `ThreadManager`.

**Regras do Jogo (`./GAME_RULES.md`):**
- `./GAME_RULES.MD`: Arquivo contendo todas as regras do jogo.

### 10. Logging e Debugabilidade Constante
- **Logs descritivos em tudo:** Sistemas vitais (Rede, Controle de Turno, Combate e IA) devem obrigatoriamente possuir `console.log` e `console.warn` frequentes e formatados (ex: `[Host] Roteando Input...`, `[NetworkSystem] Transmitindo Evento...`). 
- **Debug visual:** Em um jogo onde a arquitetura é baseada em eventos assíncronos e rede, a única forma rápida de achar a raiz de um problema sem perder tempo com breakpoints é olhando o log do console. Nunca hesite em adicionar logs verbosos ao implementar lógicas complexas.

### 11. Arquitetura Orientada a Eventos de Rede (Network-First)
- **O Motor e os Comandos:** A fundação lógica é 100% **Orientada a Eventos de Rede**. Nenhum cliente altera o estado da partida; toda ação do usuário ou da CPU vira um input `{ k: MSG.INPUT, t: INPUT.*, seq, cardId?, zone? }` enviado pelo `NetworkSystem`.
- **A Rota de um Clique:** O `input-system.js` só reporta ponteiro. O `GameClient` decide a intenção, aplica uma previsão visual e chama `sendInput(INPUT.PLAY_CARD, ...)`. O snapshot seguinte (com `ackSeq`) confirma; se o servidor recusar, chega `EVENT.REJECTED` e a previsão é desfeita.
- **Host Autoritativo:** Os inputs chegam ao `ServerEngine.handleInput()` (no Host), que valida tudo (fase, dono da carta, slot, cor, limite) e só então muta o estado. Mudanças de estado saem como **snapshot binário por jogador** (o que cada um pode ver) e as transições visuais saem como **eventos** (`emit` para os dois, `emitTo` para um só — ex.: `RAINBOW` só para quem usou Trocar Cor, `GAME_OVER` com vitória/derrota separadas). Regra de ordenação: todo `emit` envia antes o snapshot pendente, e a mutação correspondente acontece logo depois do `emit`.
- **A IA e os Adapters:** A CPU é um cliente como outro qualquer, conectada pelo `LocalCPUAdapter.cpuEndpoint`: faz `HELLO`, recebe o snapshot do assento P2 e reage ao estado (fase, rodada, descartes pendentes), nunca a atalhos internos.
- **A Regra de Ouro para a I.A do Projeto:** Toda e qualquer nova mecânica interativa (comprar cartas extras, acionar poderes, responder a armadilhas) **deve** ser um novo `INPUT`/`EVENT` em `protocol.js`, validado no `ServerEngine`/`ServerCombat` e animado no `CinematicPlayer`, em vez de atalhos no cliente.
