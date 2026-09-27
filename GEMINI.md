## Diretrizes de Otimização e Performance (Web — HTML/CSS/JS, sem engine)

Ao escrever, refatorar ou sugerir arquitetura para este projeto, atue como um engenheiro de performance web especializado em jogos que rodam 100% no navegador, sem motor externo (Godot, Unity, etc). O projeto usa HTML, CSS e JavaScript puro (bibliotecas leves como PixiJS/Three.js ou WASM só entram se explicitamente aprovado — ver Pilar 0). Sempre que precisar confirmar comportamento de uma API, suporte de navegador, ou um benchmark real, pesquise antes de afirmar algo — não assuma comportamento de spec sem checar a implementação real nos navegadores-alvo definidos neste documento.
Não tente usar o browser interno, ele vai dar erro 404, nem tente perder tempo com isso.

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
Para manter o projeto organizado e modular, a base de código é estritamente dividida por responsabilidades (seguindo o Pilar 7).

**Raiz do Projeto:**
- `/index.html`: Ponto de entrada. Estrutura do DOM, botões, painéis e contêineres para as sobreposições de vitória/derrota.
- `/style.css`: Estilização pura, layouts Flex/Grid, e micro-animações visuais aceleradas por hardware (`transform`, `opacity`).

**Configurações e Core (`/src/config/` e `/src/core/`):**
- `/src/config/constants.js`: Todas as variáveis mágicas centralizadas (HP inicial, tamanhos de carta, estados do jogo).
- `/src/core/game-loop.js`: O motor de batimentos cardíacos. Implementa "Fix Your Timestep" para separar lógica da renderização.
- `/src/core/event-bus.js`: Barramento global para comunicação genérica (Pub/Sub simples).
- `/src/core/thread-manager.js`: Gerenciador futuro para orquestrar Web Workers.

**Entidades / Dados Puros (`/src/entities/`):**
- `/src/entities/card-pool.js`: O coração da performance (Pilar 1). Usa Object Pooling e Structure of Arrays (SoA) para gerenciar centenas de propriedades de cartas sem o Garbage Collector interferir.

**Sistemas (Lógica e Regras) (`/src/systems/`):**
- `/src/systems/deck-system.js`: Regras de baralho e saques (compras de cartas).
- `/src/systems/board-system.js`: Conhece a geometria matemática dos slots do tabuleiro.
- `/src/systems/combat-system.js`: Cérebro das regras de duelo. Resolve choques de cartas, dano direto na vida (HP) e avisa se o jogo acabou.
- `/src/systems/input-system.js`: Sistema de Raycasting 2D. Converte o mouse/toque do DOM em arrastos e cliques no Canvas.
- `/src/systems/ai-system.js`: O "jogador invisível". Funciona escutando eventos de rede e enviando jogadas remotas como se fosse um cliente real.

**Rede / Multiplayer (`/src/network/`):**
- `/src/network/network-system.js`: A Super Classe de roteamento de rede. Transforma a interface e a lógica num modelo *Event-Driven* e isola o Multiplayer.
- `/src/network/network-adapter.js`: Interface/Contrato estrito (abstract) de como um meio de rede se comporta.
- `/src/network/adapters/local-cpu-adapter.js`: O simulador offline (Mock). Finge ser uma conexão de rede ligando o jogo local à IA, preparando terreno para o P2P.

**Renderização / Motor Visual (`/src/render/`):**
- `/src/render/canvas2d-renderer.js`: O pintor. Itera as cartas ativas no `cardPool` e desenha eficientemente no `<canvas>`.
- `/src/render/animator.js`: A engine interna de *Tweens*. Anima posições de `cardPool` sem gerar lixo de memória, evitando *Tween Fighting*.
- `/src/render/particle-system.js`: Motor visual leve para emitir explosões e faíscas no tabuleiro usando canvas rendering.

**Controlador Principal:**
- `/src/main.js`: O *GameController* / Host. Orquestra as classes acima, gerencia o estado da máquina (Iniciando, Descartando, Jogando) e atua como Servidor Central roteando inputs de rede.

**Workers (`/src/workers/`):**
- `/src/workers/game-worker.js`: Arquivo pronto para receber o processamento pesado no futuro, quando os Pilares de Multithreading forem ativados a fundo.

**Regras do Jogo (`./GAME_RULES.md`):**
- `./GAME_RULES.MD`: Arquivo contendo todas as regras do jogo.

### 10. Logging e Debugabilidade Constante
- **Logs descritivos em tudo:** Sistemas vitais (Rede, Controle de Turno, Combate e IA) devem obrigatoriamente possuir `console.log` e `console.warn` frequentes e formatados (ex: `[Host] Roteando Input...`, `[NetworkSystem] Transmitindo Evento...`). 
- **Debug visual:** Em um jogo onde a arquitetura é baseada em eventos assíncronos e rede, a única forma rápida de achar a raiz de um problema sem perder tempo com breakpoints é olhando o log do console. Nunca hesite em adicionar logs verbosos ao implementar lógicas complexas.

### 11. Arquitetura Orientada a Eventos de Rede (Network-First)
- **O Motor e os Comandos:** Para garantir que o jogo possa evoluir facilmente para P2P (Multiplayer real), a fundação lógica deste projeto é 100% **Orientada a Eventos de Rede (Event-Driven)**. Nenhuma classe altera o estado da partida diretamente; toda ação do usuário ou da CPU é convertida num "Pacote de Input" e despachada para o `NetworkSystem`.
- **A Rota de um Clique:** Quando o Player joga uma carta ou clica em "Finalizar Turno", o `input-system.js` não chama os métodos do jogo. Ao invés disso, ele chama `this.network.sendInput('PLAY_CARD', ...)`.
- **Host Autoritativo:** Esses inputs trafegam até o Host (que reside no `main.js`). O Host recebe esses pacotes na função `handleNetworkInput()`, processa a matemática do jogo (validando a ação), e só então dispara eventos de mudança de estado global (como `COLOR_CHOSEN`, `PREPARATION_START`, `FORCED_DISCARD_PHASE`) via `sendEvent()`.
- **A IA e os Adapters:** A IA (CPU) joga através de um adaptador Mock de rede (`LocalCPUAdapter`). Quando a IA decide jogar uma carta, ela dispara um `simulateIncomingInput`, fingindo que a requisição de jogada chegou de longe através de um cabo de rede. Da mesma forma, a IA só reage aos turnos porque escuta o Barramento do `NetworkSystem` avisando que "O Turno Começou" (`PREPARATION_START`).
- **A Regra de Ouro para a I.A do Projeto:** Toda e qualquer nova mecânica interativa que você adicionar no futuro (comprar cartas extras, acionar poderes de cartas especiais, responder a armadilhas), **deve** fluir através da classe de rede, criando novos `tipos` de `payload` em vez de criar atalhos no código.