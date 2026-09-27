import { CONFIG } from '../config/constants.js';
import { END_REASON, GAME_RESULT } from '../network/protocol.js';
import { NET_STATUS } from '../network/network-system.js';
import { SFX } from '../config/sound-presets.js';

const COLOR_ALERT_MS = 1500;
const FLOATING_TEXT_MS = 1500;
// Deve bater com a duração de `transition: opacity` de .plasma-bg--incoming em style.css
const BG_FADE_MS = 1500;

const CONNECTION_TEXT = {
    [NET_STATUS.CONNECTING]: 'Conectando...',
    [NET_STATUS.UNSTABLE]: 'Conexão instável...',
    [NET_STATUS.OPPONENT_DISCONNECTED]: 'Oponente desconectado. Aguardando reconexão (até 2 min)...',
    [NET_STATUS.RECONNECTING]: 'Conexão com o host perdida. Reconectando (até 2 min)...',
    [NET_STATUS.LOST]: 'Conexão perdida definitivamente.',
    [NET_STATUS.ERROR]: 'Erro de conexão.'
};

/**
 * Hud - única camada que toca no DOM da interface (menu, sala, HP, mensagens, fim de jogo, conexão).
 * Escritas só acontecem quando o valor muda, para não gerar recálculo de estilo à toa.
 */
export class Hud {
    /** @param {import('../audio/audio-engine.js').AudioEngine} audio */
    constructor(audio) {
        this.audio = audio;
        const $ = (id) => document.getElementById(id);
        this.el = {
            mainMenu: $('main-menu'),
            btnPlayCpu: $('btn-play-cpu'),
            btnCreateRoom: $('btn-create-room'),
            roomModal: $('room-modal'),
            roomTitle: $('room-title'),
            roomInfo: $('room-info'),
            roomCode: $('room-code-display'),
            roomWarning: $('room-warning'),
            btnCopyLink: $('btn-copy-link'),
            roomStatus: $('room-status'),
            btnCancelRoom: $('btn-cancel-room'),
            gameContainer: $('game-container'),
            selfName: $('self-name'),
            selfHP: $('self-hp'),
            oppName: $('opponent-name'),
            oppHP: $('opponent-hp'),
            endTurn: $('end-turn-btn'),
            vignette: $('damage-vignette'),
            damageText: $('damage-text-container'),
            colorAlert: $('color-alert'),
            phaseMessage: $('phase-message'),
            victory: $('victory-screen'),
            defeat: $('defeat-screen'),
            victoryReason: $('victory-reason'),
            defeatReason: $('defeat-reason'),
            nameModal: $('name-modal'),
            nameForm: $('name-form'),
            nameInput: $('name-input'),
            banner: $('connection-banner'),
            bannerText: $('connection-text'),
            bannerMenuBtn: $('connection-menu-btn'),
            plasmaIncoming: $('plasma-bg-incoming'),
            rematchNotice: $('rematch-notice'),
            rematchButtons: document.querySelectorAll('.rematch-btn')
        };

        this.cache = {
            selfHP: -1, oppHP: -1, phase: null, endVisible: null, endEnabled: null, bgColor: -1, banner: null, rematch: ''
        };
        this.colorAlertTimer = null;
        this.bgFadeTimer = null;
        this.bgFading = false;
        this.pendingBg = CONFIG.DEFAULT_BACKGROUND;
        this.roomLink = '';

        this.el.btnCopyLink.addEventListener('click', () => {
            this.audio.play(SFX.CLICK);
            this.copyRoomLink();
        });

        this.onNameSubmit = null;
        this.el.nameInput.maxLength = CONFIG.NAME_MAX_LENGTH;
        this.el.nameForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = this.el.nameInput.value.trim();
            if (!name || !this.onNameSubmit) return;
            this.audio.play(SFX.CONFIRM);
            const callback = this.onNameSubmit;
            this.hideNamePrompt();
            callback(name);
        });
    }

    // --- Nome do jogador ---------------------------------------------------

    /**
     * @param {string} defaultName valor inicial do campo
     * @param {(name: string) => void} onSubmit
     */
    askName(defaultName, onSubmit) {
        this.onNameSubmit = onSubmit;
        this.el.nameInput.value = defaultName || '';
        this.el.nameModal.hidden = false;
        this.el.nameInput.focus();
        this.el.nameInput.select();
    }

    hideNamePrompt() {
        this.onNameSubmit = null;
        this.el.nameModal.hidden = true;
    }

    /** Nomes nos cantos de vida (oppName vazio mantém o rótulo atual). */
    setNames(selfName, oppName) {
        if (selfName) this.el.selfName.textContent = selfName;
        if (oppName) this.el.oppName.textContent = oppName;
    }

    bindMenu({ onPlayCpu, onCreateRoom, onCancelRoom, onBackToMenu }) {
        const withClick = (fn) => () => {
            this.audio.play(SFX.CLICK);
            fn();
        };
        this.el.btnPlayCpu.addEventListener('click', withClick(onPlayCpu));
        this.el.btnCreateRoom.addEventListener('click', withClick(onCreateRoom));
        this.el.btnCancelRoom.addEventListener('click', withClick(onCancelRoom));
        this.el.bannerMenuBtn.addEventListener('click', withClick(onBackToMenu));
        for (const btn of document.querySelectorAll('.back-to-menu')) btn.addEventListener('click', withClick(onBackToMenu));
    }

    onRematch(callback) {
        for (const btn of this.el.rematchButtons) {
            btn.addEventListener('click', () => {
                this.audio.play(SFX.CONFIRM);
                callback();
            });
        }
    }

    onEndTurn(callback) {
        this.el.endTurn.addEventListener('click', () => {
            this.audio.play(SFX.CONFIRM);
            callback();
        });
    }

    // --- Sala --------------------------------------------------------------

    showRoomHosting(code, link, isLocalOrigin) {
        this.roomLink = link;
        this.el.roomModal.hidden = false;
        this.el.roomTitle.textContent = 'SALA CRIADA';
        this.el.roomInfo.hidden = false;
        this.el.roomCode.textContent = code;
        this.el.roomWarning.hidden = !isLocalOrigin;
        this.setRoomStatus('');
    }

    showRoomJoining(code) {
        this.el.roomModal.hidden = false;
        this.el.roomTitle.textContent = `ENTRANDO NA SALA ${code}`;
        this.el.roomInfo.hidden = true;
        this.setRoomStatus('Procurando o host... (a conexão P2P pode levar até ~10s)');
    }

    setRoomStatus(text, isError = false) {
        this.el.roomStatus.textContent = text;
        this.el.roomStatus.classList.toggle('error', isError);
    }

    hideRoomModal() {
        this.el.roomModal.hidden = true;
    }

    copyRoomLink() {
        const btn = this.el.btnCopyLink;
        const done = (label) => {
            btn.textContent = label;
            setTimeout(() => { btn.textContent = 'COPIAR LINK'; }, 2000);
        };
        if (!navigator.clipboard) {
            window.prompt('Copie o link da sala:', this.roomLink);
            return;
        }
        navigator.clipboard.writeText(this.roomLink)
            .then(() => done('COPIADO!'))
            .catch(() => window.prompt('Copie o link da sala:', this.roomLink));
    }

    // --- Partida -----------------------------------------------------------

    showGame(opponentLabel) {
        this.el.mainMenu.hidden = true;
        this.el.gameContainer.hidden = false;
        this.el.selfName.textContent = 'VOCÊ';
        this.el.oppName.textContent = opponentLabel;
    }

    setHP(selfHP, oppHP) {
        if (selfHP !== this.cache.selfHP) {
            this.cache.selfHP = selfHP;
            this.el.selfHP.textContent = selfHP;
        }
        if (oppHP !== this.cache.oppHP) {
            this.cache.oppHP = oppHP;
            this.el.oppHP.textContent = oppHP;
        }
    }

    setEndTurn(visible, enabled) {
        if (visible !== this.cache.endVisible) {
            this.cache.endVisible = visible;
            this.el.endTurn.hidden = !visible;
        }
        if (enabled !== this.cache.endEnabled) {
            this.cache.endEnabled = enabled;
            this.el.endTurn.disabled = !enabled;
        }
    }

    setPhaseMessage(text) {
        if (text === this.cache.phase) return;
        this.cache.phase = text;
        this.el.phaseMessage.textContent = text || '';
        this.el.phaseMessage.hidden = !text;
    }

    /** Troca o fundo sem alerta (usado na sincronização por snapshot). */
    syncBackground(color) {
        if (color === this.cache.bgColor) return;
        this.cache.bgColor = color;
        const palette = CONFIG.COLOR_PALETTES[color];
        const bg = palette ? palette.bg : CONFIG.DEFAULT_BACKGROUND;
        this.crossfadeBackground(bg);
    }

    /** Camada de cima volta a ficar invisível e sem transição, pronta para o próximo fade. */
    snapIncomingHidden() {
        const top = this.el.plasmaIncoming;
        top.style.transition = 'none';
        top.style.opacity = '0';
        void top.offsetWidth; // reflow: trava o "sem transição" antes de reativá-la
        top.style.transition = '';
    }

    /**
     * Cross-fade de cor via opacity entre duas camadas de gradiente (Pilar 2): a cor do
     * gradiente em si nunca é animada pelo CSS, só a opacidade da camada de cima (compositor puro).
     */
    crossfadeBackground(bg) {
        clearTimeout(this.bgFadeTimer);
        const root = document.documentElement.style;

        if (this.bgFading) {
            // Troca muito rápida, fade anterior ainda rodando: assenta a cor pendente e recomeça do zero
            root.setProperty('--bg-1', this.pendingBg[0]);
            root.setProperty('--bg-2', this.pendingBg[1]);
            root.setProperty('--bg-3', this.pendingBg[2]);
            this.snapIncomingHidden();
        }

        root.setProperty('--bg-1-next', bg[0]);
        root.setProperty('--bg-2-next', bg[1]);
        root.setProperty('--bg-3-next', bg[2]);
        this.pendingBg = bg;
        this.bgFading = true;
        this.el.plasmaIncoming.style.opacity = '1';

        this.bgFadeTimer = setTimeout(() => {
            this.bgFading = false;
            root.setProperty('--bg-1', bg[0]);
            root.setProperty('--bg-2', bg[1]);
            root.setProperty('--bg-3', bg[2]);
            this.snapIncomingHidden();
        }, BG_FADE_MS);
    }

    /** Muda o fundo e pisca o nome da cor no centro da tela. */
    showColorAlert(color) {
        const palette = CONFIG.COLOR_PALETTES[color];
        if (!palette) return;
        this.syncBackground(color);

        const alert = this.el.colorAlert;
        alert.textContent = palette.name;
        alert.style.color = color === CONFIG.COLOR.RAINBOW ? '#ffffff' : CONFIG.COLOR_HEX[color];
        alert.classList.add('show');
        clearTimeout(this.colorAlertTimer);
        this.colorAlertTimer = setTimeout(() => alert.classList.remove('show'), COLOR_ALERT_MS);
    }

    flashDamage() {
        const v = this.el.vignette;
        v.classList.add('active');
        setTimeout(() => v.classList.remove('active'), FLOATING_TEXT_MS);
    }

    showFloatingText(text, isSelfTarget) {
        const node = document.createElement('div');
        node.className = 'damage-text';
        node.textContent = text;
        node.style.top = isSelfTarget ? '70%' : '20%';
        this.el.damageText.appendChild(node);
        setTimeout(() => node.remove(), FLOATING_TEXT_MS);
    }

    showGameOver(result, reason) {
        this.setEndTurn(false, false);
        this.setPhaseMessage(null);
        const isVictory = result === GAME_RESULT.VICTORY;
        const screen = isVictory ? this.el.victory : this.el.defeat;
        const reasonEl = isVictory ? this.el.victoryReason : this.el.defeatReason;
        if (reason === END_REASON.ABANDON) {
            reasonEl.textContent = isVictory ? 'O oponente abandonou a partida.' : 'Você foi desconectado da partida.';
        } else {
            reasonEl.textContent = '';
        }
        // Oponente abandonou (ou você caiu): não há com quem jogar a revanche
        for (const btn of this.el.rematchButtons) btn.hidden = reason === END_REASON.ABANDON;
        screen.hidden = false;
        requestAnimationFrame(() => screen.classList.add('active'));
    }

    /** Fecha as telas de fim de jogo e o aviso de revanche (nova partida começando). */
    hideGameOver() {
        for (const screen of [this.el.victory, this.el.defeat]) {
            screen.classList.remove('active');
            screen.hidden = true;
        }
        this.setRematch(false, false);
    }

    /**
     * Estado da revanche vindo do snapshot (+ previsão local do próprio pedido).
     * @param {boolean} selfRequested
     * @param {boolean} oppRequested
     */
    setRematch(selfRequested, oppRequested) {
        const key = `${selfRequested ? 1 : 0}${oppRequested ? 1 : 0}`;
        if (key === this.cache.rematch) return;
        this.cache.rematch = key;

        const opponent = this.el.oppName.textContent || 'O OPONENTE';
        let label = 'REVANCHE';
        if (selfRequested) label = 'AGUARDANDO...';
        else if (oppRequested) label = 'ACEITAR REVANCHE';
        for (const btn of this.el.rematchButtons) {
            btn.textContent = label;
            btn.disabled = selfRequested;
        }

        const notice = this.el.rematchNotice;
        let text = null;
        if (selfRequested && oppRequested) text = 'REVANCHE ACEITA! PREPARANDO NOVA PARTIDA...';
        else if (oppRequested) text = `${opponent} QUER REVANCHE!`;
        else if (selfRequested) text = `PEDIDO DE REVANCHE ENVIADO. AGUARDANDO ${opponent}...`;

        notice.textContent = text || '';
        notice.classList.toggle('incoming', oppRequested && !selfRequested);
        notice.hidden = !text;
    }

    isGameOverVisible() {
        return !this.el.victory.hidden || !this.el.defeat.hidden;
    }

    // --- Conexão -----------------------------------------------------------

    /**
     * @param {string} status NET_STATUS.*
     */
    setConnectionStatus(status) {
        const text = CONNECTION_TEXT[status] || null;
        if (text === this.cache.banner) return;
        this.cache.banner = text;
        this.el.banner.hidden = !text;
        this.el.bannerText.textContent = text || '';
        const terminal = status === NET_STATUS.LOST || status === NET_STATUS.ERROR;
        this.el.bannerMenuBtn.hidden = !terminal;
        this.el.banner.classList.toggle('error', terminal);
    }
}
