import { CONFIG } from './config/constants.js';
import { GameClient } from './client/game-client.js';
import { ServerEngine } from './server/server-engine.js';
import { AISystem } from './systems/ai-system.js';
import { NetworkSystem, NET_EVENT, NET_STATUS } from './network/network-system.js';
import { LocalCPUAdapter } from './network/adapters/local-cpu-adapter.js';
import { TrysteroAdapter } from './network/adapters/trystero-adapter.js';
import { Hud } from './ui/hud.js';
import { SettingsPanel } from './ui/settings-panel.js';
import { Viewport } from './core/viewport.js';
import { AudioEngine } from './audio/audio-engine.js';
import { i18n } from './i18n/index.js';

const TOKEN_KEY_PREFIX = 'yugi-uno:token:';
const LAST_NAME_KEY = 'yugi-uno:last-name';

function randomRoomCode() {
    const { ROOM_CODE_ALPHABET: alphabet, ROOM_CODE_LENGTH: length } = CONFIG.NETWORK;
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    let code = '';
    for (let i = 0; i < length; i++) code += alphabet[bytes[i] % alphabet.length];
    return code;
}

function sanitizeRoomCode(raw) {
    return String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

function isLocalOrigin() {
    const host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '';
}

/** Token estável por aba e sala: recarregar a página reconecta ao mesmo assento. */
function loadOrCreateToken(roomCode) {
    const key = TOKEN_KEY_PREFIX + roomCode;
    try {
        const existing = sessionStorage.getItem(key);
        if (existing) return existing;
    } catch (err) { /* armazenamento indisponível: segue com token novo */ }

    const token = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try { sessionStorage.setItem(key, token); } catch (err) { /* idem */ }
    return token;
}

/**
 * Celular: tela cheia + trava em horizontal. Precisa ser chamado dentro de um gesto do usuário.
 * Navegadores sem suporte (ex.: Safari no iPhone) apenas ignoram; o aviso de "gire o celular" cobre o resto.
 */
function enterLandscapeFullscreen() {
    if (!window.matchMedia('(pointer: coarse)').matches) return;
    const root = document.documentElement;
    if (document.fullscreenElement || !root.requestFullscreen) return;
    root.requestFullscreen({ navigationUI: 'hide' })
        .then(() => (screen.orientation && screen.orientation.lock ? screen.orientation.lock('landscape') : null))
        .catch((err) => console.warn('[App] Tela cheia/orientação não disponível:', err && err.message));
}

/** Conveniência por navegador: lembra o último nome usado (falha silenciosa sem armazenamento). */
function loadLastName() {
    try { return localStorage.getItem(LAST_NAME_KEY) || ''; } catch (err) { return ''; }
}

function saveLastName(name) {
    try { localStorage.setItem(LAST_NAME_KEY, name); } catch (err) { /* armazenamento indisponível */ }
}

/**
 * App - bootstrap: menu, criação/entrada de sala e montagem de Host (servidor + cliente local) ou Client.
 */
class App {
    constructor() {
        this.audio = new AudioEngine();
        this.hud = new Hud(this.audio);
        this.settings = new SettingsPanel(this.audio);
        this.viewport = new Viewport();
        this.network = null;
        this.server = null;
        this.client = null;
        this.onlineMatch = false;
        this.matchStarted = false;
        this.leaving = false;
        this.params = new URLSearchParams(window.location.search);
    }

    init() {
        i18n.updateDOM();
        console.log('[App] Inicializando menu principal.');
        this.audio.init();
        this.hud.bindMenu({
            onPlayCpu: () => {
                enterLandscapeFullscreen();
                this.playVsCpu();
            },
            onCreateRoom: () => {
                enterLandscapeFullscreen();
                this.createRoom();
            },
            onCancelRoom: () => this.backToMenu(),
            onBackToMenu: () => this.backToMenu()
        });

        window.addEventListener('beforeunload', (e) => {
            if (!this.onlineMatch || this.leaving || !this.matchStarted || this.hud.isGameOverVisible()) return;
            e.preventDefault();
            e.returnValue = '';
        });

        const room = this.params.get('room');
        if (room) this.joinRoom(sanitizeRoomCode(room));
    }

    createSession(opponentLabel) {
        this.network = new NetworkSystem();
        this.client = new GameClient({ network: this.network, hud: this.hud, viewport: this.viewport, audio: this.audio, opponentLabel });
        if (this.params.has('autoplay')) this.attachAutopilot();
    }

    /** Piloto automático do jogador local para testes de sincronização (?autoplay). */
    attachAutopilot() {
        console.warn('[App] Modo autoplay ativo: o jogador local é controlado pela IA.');
        const bot = new AISystem((msg) => this.network.sendInput(msg), 'AUTOPLAY');
        this.network.on(NET_EVENT.SERVER_MESSAGE, (msg) => bot.handleMessage(msg));
    }

    playVsCpu() {
        console.log('[App] Modo Player vs CPU.');
        this.createSession('CPU');
        this.server = new ServerEngine(this.network);

        const adapter = new LocalCPUAdapter();
        const ai = new AISystem((msg) => adapter.cpuEndpoint.send(msg), 'CPU');
        adapter.cpuEndpoint.onMessage = (msg) => ai.handleMessage(msg);
        adapter.cpuEndpoint.onConnected = () => ai.hello();

        this.network.on(NET_EVENT.SEAT_CONNECTED, (seat, isFirst) => {
            if (isFirst) this.beginHostedMatch();
        });
        this.network.startHost(adapter, 'local-cpu');
    }

    createRoom() {
        const code = randomRoomCode();
        const link = `${window.location.origin}${window.location.pathname}?room=${code}`;
        console.log(`[App] Criando sala ${code}. Link: ${link}`);

        this.onlineMatch = true;
        this.hud.showRoomHosting(code, link, isLocalOrigin());
        this.createSession('OPONENTE');
        this.server = new ServerEngine(this.network);

        this.network.on(NET_EVENT.SEAT_CONNECTED, (seat, isFirst) => {
            if (isFirst) this.beginHostedMatch();
        });
        this.network.on(NET_EVENT.STATUS, (status) => this.onNetworkStatus(status));
        this.network.startHost(new TrysteroAdapter(), code);
    }

    joinRoom(code) {
        if (!code) return;
        console.log(`[App] Entrando na sala ${code}.`);
        this.onlineMatch = true;
        this.hud.showRoomJoining(code);
        this.createSession('OPONENTE');

        this.network.on(NET_EVENT.JOINED, () => {
            this.matchStarted = true;
            this.hud.hideRoomModal();
            this.startLocalPlayer();
        });
        this.network.on(NET_EVENT.STATUS, (status) => this.onNetworkStatus(status));
        this.network.startClient(new TrysteroAdapter(), code, loadOrCreateToken(code));

        setTimeout(() => {
            if (!this.matchStarted && this.network.status === NET_STATUS.CONNECTING) {
                this.hud.setRoomStatus('Ainda procurando o host... Confira se o host está com a sala aberta e se o código está correto.');
            }
        }, CONFIG.NETWORK.JOIN_SLOW_WARNING_MS);
    }

    beginHostedMatch() {
        console.log('[App] Oponente conectado. Iniciando partida.');
        this.matchStarted = true;
        this.hud.hideRoomModal();
        this.startLocalPlayer();
        this.server.start();
    }

    /** Mostra o jogo e pede o nome; a partida só começa quando os dois jogadores tiverem nome. */
    startLocalPlayer() {
        this.client.start();
        // Fica pendente até o 1º gesto do usuário se ainda não houve nenhum (política de autoplay)
        this.audio.music.play('MAIN_THEME');
        if (this.client.knownSelfName) return;
        if (this.params.has('autoplay')) {
            this.client.submitName('AUTOPLAY');
            return;
        }
        this.hud.askName(loadLastName(), (name) => {
            enterLandscapeFullscreen();
            saveLastName(name);
            this.client.submitName(name);
        });
    }

    onNetworkStatus(status) {
        if (this.matchStarted) {
            this.hud.setConnectionStatus(status);
            return;
        }
        if (status === NET_STATUS.ROOM_FULL) this.hud.setRoomStatus('Esta sala já está cheia.', true);
        else if (status === NET_STATUS.ERROR) this.hud.setRoomStatus('Erro ao conectar na rede P2P. Tente novamente.', true);
    }

    backToMenu() {
        this.leaving = true;
        if (this.network) this.network.shutdown();
        window.location.href = window.location.pathname;
    }
}

window.addEventListener('load', () => {
    const app = new App();
    app.init();
    if (new URLSearchParams(window.location.search).has('debug')) window.__yugi = app;
});
