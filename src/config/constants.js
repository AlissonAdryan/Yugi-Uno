const COLOR = Object.freeze({
    NONE: 0,
    RED: 1,
    BLUE: 2,
    GREEN: 3,
    YELLOW: 4,
    BLACK: 5,
    RAINBOW: 6
});

const CARD_TYPES = Object.freeze({
    NUMBER: 0,
    PLUS2: 1,
    PLUS4: 2,
    BLOCK: 3,
    REVERSE: 4,
    CHANGE_COLOR: 5,
    HIDDEN: 255
});

export const CONFIG = Object.freeze({
    CANVAS_ID: 'game-canvas',
    PHYSICS_TIMESTEP: 1000 / 60,

    DECK_SIZE: 255,
    INITIAL_HAND_SIZE: 9,
    MAX_HAND_SIZE: 15,
    STARTING_HP: 30,
    NAME_MAX_LENGTH: 16,
    FORCED_DISCARD_COUNT: 2,
    ROUND_DRAWS: Object.freeze({ WINNER: 2, LOSER: 1, TIE: 1 }),
    NUMBER_RANGE: Object.freeze({ MIN: 1, MAX: 9 }),
    REVERSE_COMPENSATION_POWER: 1,
    // Trava de segurança contra loops de combate (cadeias de +2/+4 são finitas, mas nunca confiamos cegamente)
    COMBAT_MAX_STEPS: 200,
    COMBO_MAX_STACK: 3,

    // Resolução virtual de referência: altura mínima para mãos + tabuleiro com respiro (~870px ocupados)
    // Mantém a proporção 20:13 de 1425x926; (canvas + HUD) levemente para cima.
    VIEW: Object.freeze({
        DESIGN_WIDTH: 1425,
        DESIGN_HEIGHT: 926,
        MAX_DPR: 2,
        UI_SCALE_MIN: 0.6,
        UI_SCALE_MAX: 1.25
    }),

    CARD_DIMENSIONS: Object.freeze({
        WIDTH: 100,
        HEIGHT: 150,
        RADIUS: 10
    }),
    HAND_SCALE: 0.9,
    HAND_MARGIN_X: 170,
    HAND_STEP_RATIO: 0.72,
    STACK_OFFSET: Object.freeze({ X: -2, Y: -4 }),

    COLOR,
    BASIC_COLORS: Object.freeze([COLOR.RED, COLOR.BLUE, COLOR.GREEN, COLOR.YELLOW]),
    COLOR_HEX: Object.freeze(['#2c3e50', '#e74c3c', '#3498db', '#2ecc71', '#ffcc00', '#111111', '#ffffff']),
    // `name` é só pra log de servidor/depuração (Pilar 10) — nunca mostrado ao jogador. O texto na
    // tela vem de i18n.t(COLOR_NAME_KEYS[cor]), que existe em todos os idiomas (ver Pilar 7/CLAUDE.md).
    COLOR_PALETTES: Object.freeze([
        null,
        { name: 'VERMELHO', bg: ['#4a0f0f', '#721616ff', '#370606', '#680202ff'] },
        { name: 'AZUL', bg: ['#0f204a', '#153366', '#061337', '#0c2b49ff'] },
        { name: 'VERDE', bg: ['#0f4a15', '#156620', '#06370f', '#265500ff'] },
        { name: 'AMARELO', bg: ['#4a4a0f', '#666615', '#373706', '#474417ff'] },
        null,
        // Rainbow: bg é fallback-only; as cores reais são sempre calculadas dinamicamente por Hud._rainbowBg()
        { name: 'QUALQUER COR!', bg: ['#1e0f61', '#153366', '#156620', '#666615'] }
    ]),
    // Chave de i18n por cor (mesmos índices de COLOR_PALETTES) — usar sempre isto, nunca .name, pra texto na tela.
    COLOR_NAME_KEYS: Object.freeze([null, 'COLOR_RED', 'COLOR_BLUE', 'COLOR_GREEN', 'COLOR_YELLOW', null, 'COLOR_RAINBOW']),
    DEFAULT_BACKGROUND: Object.freeze(['#1e0f61', '#152066', '#37064a', '#2e1060']),

    CARD_TYPES,

    // Contorno animado (sentido horário) nas cartas da mão que podem ser jogadas agora. Só visual e só local.
    PLAYABLE_OUTLINE: Object.freeze({
        // Tipos que nunca recebem o contorno, mesmo quando jogáveis
        EXCLUDED_TYPES: Object.freeze([CARD_TYPES.CHANGE_COLOR]),
        COLOR: '#7df9ff',
        GLOW_COLOR: 'rgba(0, 229, 255, 0.35)',
        LINE_WIDTH: 3,
        GLOW_WIDTH: 9,
        PADDING: 3,
        DASH_COUNT: 4,
        DASH_FILL: 0.5,
        SPEED: 140
    }),

    // O código normaliza pelo total, então os pesos não precisam somar 100
    CARD_SPAWN_WEIGHTS: Object.freeze({
        NUMBER: 70,
        SPECIAL_BASE: 30,
        SPECIALS: Object.freeze({
            PLUS2: 10,
            PLUS4: 5,
            BLOCK: 8,
            REVERSE: 7,
            CHANGE_COLOR: 8
        })
    }),

    GAME_STATES: Object.freeze({
        INIT: 0,
        MENU: 1,
        PLAYING: 2,
        COMBAT_RESOLUTION: 3,
        DISCARDING: 4,
        FORCED_DISCARDING: 5,
        GAME_OVER: 6,
        // Perdedor da rodada (que levou dano) escolhe a próxima cor entre as cores em comum
        CHOOSING_COLOR: 7
    }),

    // Pausas do servidor (ms). Cada pausa é >= à animação correspondente no cliente,
    // assim os dois jogadores nunca acumulam atraso em relação ao host.
    TIMINGS: Object.freeze({
        REVEAL: 450,
        PROMOTE: 650,
        SUMMON_BASE: 900,
        SUMMON_PER_CARD: 180,
        CLASH: 1150,
        TIE: 950,
        TIE_DEFENSE_DELAY: 1500,
        BLOCK_SMASH: 1000,
        REVERSE: 1000,
        DIRECT_HIT: 1400,
        DESTROY: 350,
        ROUND_END_PAUSE: 700,
        NEXT_ROUND_DELAY: 600,
        FORCED_REDRAW_DELAY: 700,
        GAME_OVER_SEQUENCE: 3000,
        COLOR_CHOICE_TIMEOUT: 10000
    }),

    ANIM: Object.freeze({
        LIFT: 250,
        DASH: 180,
        RETURN: 300,
        FLIP_HALF: 150,
        SHAKE_STEP: 50,
        HAND_MOVE: 450,
        BOARD_MOVE: 350,
        SPAWN_MOVE: 400,
        SPAWN_STAGGER: 90,
        HOVER: 200,
        // Tempos próprios do consumível (não reaproveitam SPAWN_MOVE/LIFT: mudar isso não afeta
        // choque/empate/bloqueio nem a distribuição de cartas). Consumo total ~640ms (era ~1000ms).
        CONSUMABLE_MOVE: 280,
        CONSUMABLE_HOLD: 200,
        CONSUMABLE_LIFT: 160,
        HOVER_LIFT: -20,
        DIRECT_LIFT: 300,
        DIRECT_RECOIL: 200,
        DIRECT_DASH: 150,
        DIRECT_RETURN: 400,
        SAFETY_MARGIN: 150,
        RENDER_SMOOTHING: 0.6
    }),

    AI: Object.freeze({
        THINK_MS: 900,
        ACTION_GAP_MS: 700,
        DEFENSE_CHANCE: 0.5,
        CONSUMABLE_CHANCE: 0.7,
        MAX_REJECTIONS: 3
    }),

    NETWORK: Object.freeze({
        APP_ID: 'yugi-uno-p2p',
        TRYSTERO_URL: 'https://esm.run/@trystero-p2p/mqtt@0.25.4',
        ACTION_NAME: 'msg',
        ROOM_CODE_LENGTH: 5,
        ROOM_CODE_ALPHABET: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
        HEARTBEAT_INTERVAL_MS: 2000,
        HEARTBEAT_TIMEOUT_MS: 4000,
        UNSTABLE_AFTER_MISSES: 2,
        RECONNECT_GRACE_MS: 120000,
        JOIN_SLOW_WARNING_MS: 15000,
        /*
         * Antes de qualquer par de verdade conectar, uma tentativa de handshake WebRTC pode falhar
         * (SDP/ICE) sem que a sala em si esteja quebrada — é só aquela tentativa específica. Em vez
         * de matar a sessão (o host tendo que gerar um link novo), o FallbackAdapter espera esse
         * intervalo e tenta de novo, ciclando pelos transportes disponíveis indefinidamente até um
         * par conectar de verdade ou o jogador sair manualmente da sala.
         */
        CONNECTION_RETRY_DELAY_MS: 3000,
        LOCAL_CPU_LATENCY_MS: 150,
        MAX_CLIENT_BACKLOG: 40,
        PENDING_INPUT_TIMEOUT_MS: 5000,
        /*
         * Camada 1 (sempre ativa, zero configuração): TURN de fallback (formato Trystero turnConfig)
         * para quando os dois pares não conseguem abrir um caminho P2P direto (NAT simétrico, rede
         * corporativa, algumas redes móveis) — sem isso, a sala falha com "could not connect to peer
         * ... after exchanging SDP". Open Relay Project (metered.ca), grátis, sem conta, sem cartão.
         * Credencial pública e COMPARTILHADA com o mundo inteiro (não é segredo) — por isso existe a
         * Camada 2 abaixo, com cota própria em vez de dividida com todo mundo que usa essa lib.
         */
        TURN_SERVERS: Object.freeze([
            Object.freeze({ urls: 'stun:openrelay.metered.ca:80' }),
            Object.freeze({ urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' }),
            Object.freeze({ urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }),
            Object.freeze({ urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }),
            // turns: (TURN sobre TLS) é o que de fato atravessa firewall corporativo com inspeção
            // profunda de pacote (DPI): o tráfego fica indistinguível de HTTPS normal na porta 443.
            Object.freeze({ urls: 'turns:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' })
        ]),

        /*
         * Camada 2 (opcional, sem cartão): TURN dedicado — mesmo provedor (Metered), mas uma conta
         * SUA e gratuita (dashboard.metered.ca/signup, sem cartão), com cota própria em vez de
         * dividida com o mundo inteiro como a Camada 1. Protege contra o Open Relay público ficar
         * sobrecarregado/instável sob uso pesado global. Gere 1 credencial no dashboard (TURN Server ->
         * Add Credential) e cole as 4 URLs + usuário/senha aqui — são estáticas (o plano free não
         * expira nem exige rotação). Deixe a lista vazia pra desativar: cai só na Camada 1, sem quebrar
         * nada. Como qualquer credencial que precisa estar no bundle do cliente (o jogo não tem
         * backend), ela é visível pra quem inspecionar o código — o risco é alguém consumir sua cota
         * gratuita, nunca cobrança (é plano free, sem cartão cadastrado).
         */
        TURN_SERVERS_OWN: Object.freeze([
            Object.freeze({ urls: 'stun:stun.relay.metered.ca:80' }),
            Object.freeze({ urls: 'turn:global.relay.metered.ca:80', username: 'a2a93d0668e9a1036aab9fe5', credential: 'VStgKko94AHd7QhV' }),
            Object.freeze({ urls: 'turn:global.relay.metered.ca:80?transport=tcp', username: 'a2a93d0668e9a1036aab9fe5', credential: 'VStgKko94AHd7QhV' }),
            Object.freeze({ urls: 'turns:global.relay.metered.ca:443?transport=tcp', username: 'a2a93d0668e9a1036aab9fe5', credential: 'VStgKko94AHd7QhV' })
        ]),

        /*
         * Camada 3 (opcional, sem cartão): relay via WebSocket — não é mais WebRTC, é só um túnel de
         * mensagens (ver /relay-server/). Único fallback que atravessa até as redes mais hostis
         * (WebSocket na porta 443 é indistinguível de HTTPS comum). Só é tentado se o WebRTC (Trystero)
         * falhar antes de qualquer par conectar, e mesmo assim o FallbackAdapter continua ciclando
         * indefinidamente (ver fallback-adapter.js) — essa camada nunca é obrigatória pro jogo rodar.
         * Hospede /relay-server/ grátis no Render (sem cartão) e cole a URL wss:// aqui. Vazio desativa.
         */
        RELAY_WS_ENDPOINT: 'wss://yugi-uno.onrender.com/'
    }),

    AUDIO: Object.freeze({
        BUS: Object.freeze({ MASTER: 'master', MUSIC: 'music', SFX: 'sfx', UI: 'ui' }),
        // Volumes iniciais por barramento (0..1). O master passa por um limitador antes da saída.
        VOLUME: Object.freeze({ MASTER: 0.9, MUSIC: 0.55, SFX: 0.5, UI: 0.6 }),
        // Teto de sons sintetizados simultâneos; acima disso o mais antigo é cortado com fade curto
        MAX_VOICES: 24,
        // Escala de tempo por "comprimento" pedido em play(..., { length })
        LENGTH_SCALE: Object.freeze({ SHORT: 0.6, MEDIUM: 1, LONG: 1.8 }),
        START_LOOKAHEAD_S: 0.005,
        STEAL_FADE_S: 0.015,
        DEFAULT_FADE_S: 0.8,
        NOISE_BUFFER_S: 2,
        MAX_ECHO_TAIL_S: 3,
        // Pausa a música e suspende o AudioContext com a aba escondida (economia de bateria no celular)
        SUSPEND_WHEN_HIDDEN: true,
        // 'ambient' respeita a chave de silencioso do iPhone e mistura com outros apps (Audio Session API)
        SESSION_TYPE: 'ambient',
        DEBUG_LOG: false,
        // Faixas de música: `sources` em ordem de preferência (a 1ª que o navegador suportar é usada;
        // adicione .m4a para iOS < 18.4), `volume` própria da faixa (0..1, multiplica com o barramento MUSIC).
        MUSIC: Object.freeze({
            MAIN_THEME: Object.freeze({
                sources: Object.freeze(['assets/audio/music/main_theme.ogg']),
                volume: 0.1 // -90% do volume original da faixa
            })
        }),
        // Efeitos gravados (arquivo curto, decodificado inteiro em memória): `sources` + `volume` padrão
        // do sample (0..1, multiplica com o barramento SFX; playSample(..., { volume }) sobrescreve por disparo).
        SAMPLES: Object.freeze({
            CARD_HOVER: Object.freeze({
                sources: Object.freeze(['assets/audio/sfx/card_hover.ogg']),
                volume: 0.3 // -30% do volume original do arquivo
            })
        })
    }),

    WORKER_MESSAGES: Object.freeze({
        INIT: 'INIT',
        CALCULATE_BATTLE: 'CALCULATE_BATTLE'
    })
});
