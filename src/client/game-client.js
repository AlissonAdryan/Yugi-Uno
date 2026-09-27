import { CONFIG } from '../config/constants.js';
import { GameLoop } from '../core/game-loop.js';
import { CardPool } from '../entities/card-pool.js';
import { Animator, Easing } from '../render/animator.js';
import { Canvas2DRenderer } from '../render/canvas2d-renderer.js';
import { CinematicPlayer } from '../render/cinematic-player.js';
import { ParticleSystem, PARTICLE_TYPES } from '../render/particle-system.js';
import { BoardSystem } from '../systems/board-system.js';
import { InputSystem } from '../systems/input-system.js';
import { LayoutSystem } from '../systems/layout-system.js';
import { PlayableSystem } from '../systems/playable-system.js';
import { SAMPLES, SFX } from '../config/sound-presets.js';
import { ColorPicker } from '../ui/color-picker.js';
import { ZONE } from '../utils/zones.js';
import {
    EVENT, INPUT, MSG, SNAPSHOT_FLAGS, SnapshotView, decodeSnapshot, isBinaryMessage, isSeqAfter
} from '../network/protocol.js';
import { NET_EVENT } from '../network/network-system.js';

const { GAME_STATES, CARD_DIMENSIONS, ANIM } = CONFIG;
const HALF_W = CARD_DIMENSIONS.WIDTH / 2;
const HALF_H = CARD_DIMENSIONS.HEIGHT / 2;
const PREDICTED_HAND_ORDER = 254;
const DRAG_Z_INDEX = 1000;

/**
 * GameClient - o "jogador" local (host ou convidado). Só desenha e envia intenções:
 * toda regra é decidida pelo servidor.
 *
 * Sincronização: snapshots e eventos entram numa fila única e são processados em ordem estrita.
 * Cada cinemática termina antes do próximo item, então P1 e P2 veem exatamente a mesma sequência.
 */
export class GameClient {
    /**
     * @param {{ network: import('../network/network-system.js').NetworkSystem, hud: import('../ui/hud.js').Hud,
     *           opponentLabel: string }} options
     */
    constructor({ network, hud, viewport, audio, opponentLabel }) {
        this.network = network;
        this.hud = hud;
        this.viewport = viewport;
        this.audio = audio;
        this.opponentLabel = opponentLabel;

        this.pool = new CardPool();
        this.view = new SnapshotView();
        this.hasSnapshot = false;
        this.present = new Uint8Array(this.pool.maxCards);

        this.board = new BoardSystem();
        this.animator = new Animator();
        this.particles = new ParticleSystem(2000);
        this.input = new InputSystem();
        this.layout = new LayoutSystem(this.pool, this.board, this.animator);
        this.playable = new PlayableSystem(this.pool, this.layout, this.board);
        this.cinematics = new CinematicPlayer({
            pool: this.pool, animator: this.animator, particles: this.particles, hud: this.hud, board: this.board,
            viewport: this.viewport, audio: this.audio
        });
        this.colorPicker = new ColorPicker(audio);

        this.canvas = document.getElementById(CONFIG.CANVAS_ID);
        this.renderer = null;
        this.gameLoop = null;

        this.queue = [];
        this.pumping = false;
        this.hoveredCard = -1;
        this.started = false;
        this.boardFrozen = false;
        this.knownSelfName = '';

        // Inputs enviados e ainda não confirmados pelo ack do snapshot: { seq, t, id, zone, order }
        this.inputSeq = 0;
        this.pendingInputs = [];

        this.scene = { deckX: 0, deckY: 0, deckCount: 0, hoveredCard: -1, selectableZone: -1 };

        network.on(NET_EVENT.SERVER_MESSAGE, (msg) => this.enqueue(msg));
    }

    start() {
        if (this.started) return;
        this.started = true;
        console.log('[Client] Iniciando cliente de jogo.');
        this.hud.showGame(this.opponentLabel);

        this.renderer = new Canvas2DRenderer(this.canvas, this.pool, this.particles, this.board, this.viewport, (w, h) => {
            this.layout.resize(w, h);
            this.particles.setBounds(w, h);
            if (this.hasSnapshot) this.relayout();
        });

        this.setupInput();
        this.hud.onEndTurn(() => this.sendReady());
        this.hud.onRematch(() => this.requestRematch());

        this.gameLoop = new GameLoop(
            () => this.update(),
            (alpha, dt) => this.render(dt)
        );
        this.gameLoop.start();
        this.pump();
    }

    // --- Fila de mensagens do servidor -------------------------------------

    enqueue(msg) {
        this.queue.push(msg);
        if (this.started) this.pump();
    }

    async pump() {
        if (this.pumping) return;
        this.pumping = true;
        try {
            while (this.queue.length > 0) {
                const msg = this.queue.shift();
                if (isBinaryMessage(msg)) {
                    this.applySnapshot(msg);
                    continue;
                }
                if (!msg || msg.k !== MSG.EVENT) continue;
                await this.handleEvent(msg);
            }
        } catch (err) {
            console.error('[Client] Erro processando mensagens do servidor:', err);
        } finally {
            this.pumping = false;
        }
        if (this.queue.length > 0) this.pump();
    }

    async handleEvent(evt) {
        if (evt.t === EVENT.REJECTED) {
            console.warn(`[Client] Jogada recusada pelo servidor: ${evt.reason}`);
            this.pendingInputs = this.pendingInputs.filter((p) => p.seq !== evt.seq);
            if (evt.input === INPUT.CHOOSE_COLOR) this.colorPicker.unlock();
            this.restoreFromView();
            if (this.cinematics.gameOverShown) this.syncRematch();
            return;
        }

        if (evt.t === EVENT.PLAYER_NAMES) {
            if (evt.selfName) this.knownSelfName = evt.selfName;
            this.hud.setNames(evt.selfName, evt.oppName);
            // Reconexão: o servidor já conhece nosso nome, não precisa perguntar de novo
            if (evt.selfName) this.hud.hideNamePrompt();
            return;
        }

        // A partir daqui o tabuleiro é da cinemática final; snapshots não recriam cartas explodidas
        if (evt.t === EVENT.GAME_OVER) this.boardFrozen = true;
        // O seletor some antes do alerta da cor escolhida (ou da tela de fim de jogo) aparecer
        if (evt.t === EVENT.COLOR_CHOSEN || evt.t === EVENT.GAME_OVER) this.colorPicker.hide();

        // Aba escondida (rAF parado) ou fila muito atrasada: aplica o resultado sem animar
        const skipAnimation = document.hidden || this.queue.length > CONFIG.NETWORK.MAX_CLIENT_BACKLOG;
        if (skipAnimation) {
            this.cinematics.applyInstant(evt);
            return;
        }
        await this.cinematics.play(evt);
    }

    // --- Snapshots ---------------------------------------------------------

    applySnapshot(bytes) {
        if (!decodeSnapshot(bytes, this.view)) {
            console.warn('[Client] Snapshot inválido ignorado.');
            return;
        }
        const v = this.view;
        const pool = this.pool;
        const present = this.present;

        // Saiu de GAME_OVER: os dois aceitaram a revanche e o servidor já distribuiu a nova partida
        if ((this.boardFrozen || this.cinematics.gameOverShown) && v.phase !== GAME_STATES.GAME_OVER) {
            this.resetForNewMatch();
        }

        if (this.boardFrozen) {
            this.hud.setHP(v.selfHP, v.oppHP);
            this.hud.setEndTurn(false, false);
            this.hud.setPhaseMessage(null);
            this.dropAckedInputs();
            this.syncRematch();
            return;
        }
        present.fill(0);

        // Toca o som de "comprar cartas" 1x por snapshot (não por carta), e só quando cartas de fato novas
        // (nunca vistas por este cliente) chegam a uma mão — nunca na 1ª sincronização (conexão/reconexão).
        const wasSynced = this.hasSnapshot;
        let drewCards = false;

        for (let i = 0; i < v.cardCount; i++) {
            const id = v.ids[i];
            if (id >= pool.maxCards) continue;
            present[id] = 1;
            if (pool.active[id] !== 1) {
                pool.activate(id, this.layout.deckX, this.layout.deckY);
                if (wasSynced && (v.zone[i] === ZONE.SELF_HAND || v.zone[i] === ZONE.OPP_HAND)) drewCards = true;
            }
            pool.zone[id] = v.zone[i];
            pool.order[id] = v.order[i];
            pool.type[id] = v.type[i];
            pool.color[id] = v.color[i];
            pool.power[id] = v.power[i];
        }
        if (drewCards) this.audio.play(SFX.CARD_DRAW);

        for (let id = 0; id < pool.maxCards; id++) {
            if (pool.active[id] === 1 && present[id] === 0) {
                this.animator.cancel(id, pool);
                pool.deactivate(id);
            }
        }

        if (!this.hasSnapshot) this.inputSeq = v.ackSeq;
        this.hasSnapshot = true;
        this.dropAckedInputs();
        this.reapplyPredictions();

        const dragged = this.input.draggedCard;
        if (dragged !== -1 && (!pool.isActive(dragged) || pool.zone[dragged] !== ZONE.SELF_HAND || !this.canPrepare())) {
            this.input.cancelDrag();
            this.board.highlightZone = -1;
        }

        this.scene.deckCount = v.deckCount;
        this.board.setLocked(ZONE.SELF_DEFENSE, v.hasFlag(SNAPSHOT_FLAGS.SELF_DEFENSE_LOCKED));
        this.board.setLocked(ZONE.OPP_DEFENSE, v.hasFlag(SNAPSHOT_FLAGS.OPP_DEFENSE_LOCKED));
        this.hud.setHP(v.selfHP, v.oppHP);
        this.hud.syncBackground(v.selfColor);

        this.relayout();

        if (v.phase === GAME_STATES.GAME_OVER && !this.cinematics.gameOverShown && this.queue.length === 0) {
            this.cinematics.showGameOverScreen(v.result, 0);
        }
        if (v.phase === GAME_STATES.GAME_OVER) this.syncRematch();
    }

    /** Descarta previsões já confirmadas pelo ack do snapshot (ou velhas demais). */
    dropAckedInputs() {
        const ack = this.view.ackSeq;
        const now = performance.now();
        const timeout = CONFIG.NETWORK.PENDING_INPUT_TIMEOUT_MS;
        this.pendingInputs = this.pendingInputs.filter((p) => isSeqAfter(p.seq, ack) && now - p.sentAt < timeout);
    }

    // --- Revanche ----------------------------------------------------------

    requestRematch() {
        if (!this.cinematics.gameOverShown || this.isRematchRequested()) return;
        console.log('[Client] Pedindo revanche.');
        this.sendInput(INPUT.REMATCH, -1);
        this.syncRematch();
    }

    isRematchRequested() {
        return this.view.hasFlag(SNAPSHOT_FLAGS.SELF_REMATCH) || this.hasPending(INPUT.REMATCH);
    }

    syncRematch() {
        this.hud.setRematch(this.isRematchRequested(), this.view.hasFlag(SNAPSHOT_FLAGS.OPP_REMATCH));
    }

    /**
     * Os dois aceitaram a revanche: limpa o tabuleiro local para a nova distribuição entrar
     * animada a partir do baralho (os ids das cartas são reaproveitados pelo servidor).
     */
    resetForNewMatch() {
        console.log('[Client] Revanche aceita: nova partida começando.');
        this.boardFrozen = false;
        this.cinematics.reset();
        this.hud.hideGameOver();
        this.colorPicker.hide();
        this.input.cancelDrag();
        this.board.highlightZone = -1;
        this.hoveredCard = -1;
        this.pendingInputs = [];

        const pool = this.pool;
        for (let id = 0; id < pool.maxCards; id++) {
            if (pool.active[id] !== 1) continue;
            this.animator.cancel(id, pool);
            pool.deactivate(id);
        }
    }

    /** Volta às zonas do último snapshot autoritativo e reaplica só as previsões ainda pendentes. */
    restoreFromView() {
        const v = this.view;
        for (let i = 0; i < v.cardCount; i++) {
            const id = v.ids[i];
            if (!this.pool.isActive(id)) continue;
            this.pool.zone[id] = v.zone[i];
            this.pool.order[id] = v.order[i];
        }
        this.reapplyPredictions();
        this.relayout();
    }

    reapplyPredictions() {
        const pool = this.pool;
        for (const p of this.pendingInputs) {
            if (p.zone < 0 || !pool.isActive(p.id)) continue;
            const current = pool.zone[p.id];
            const stillMine = current === ZONE.SELF_HAND || current === ZONE.SELF_ATTACK
                || current === ZONE.SELF_DEFENSE || current === ZONE.SELF_USE;
            if (!stillMine) continue;
            pool.zone[p.id] = p.zone;
            pool.order[p.id] = p.order;
        }
    }

    hasPending(inputType) {
        for (const p of this.pendingInputs) if (p.t === inputType) return true;
        return false;
    }

    countPending(inputType) {
        let n = 0;
        for (const p of this.pendingInputs) if (p.t === inputType) n++;
        return n;
    }

    /**
     * Envia um input com número de sequência e registra a previsão visual correspondente.
     * @param {number} type INPUT.*
     * @param {number} id carta envolvida (-1 se nenhuma)
     * @param {number} predictedZone zona prevista (-1 = sem mudança visual)
     * @param {number} predictedOrder
     * @param {number} [zone] zona alvo enviada ao servidor
     * @param {object} [extra] campos adicionais do input (ex.: { color })
     */
    sendInput(type, id, predictedZone = -1, predictedOrder = 0, zone = undefined, extra = null) {
        this.inputSeq = (this.inputSeq + 1) & 0xffff;
        const msg = { k: MSG.INPUT, t: type, seq: this.inputSeq };
        if (id >= 0) msg.cardId = id;
        if (zone !== undefined) msg.zone = zone;
        if (extra) Object.assign(msg, extra);

        this.pendingInputs.push({
            seq: this.inputSeq, t: type, id, zone: predictedZone, order: predictedOrder, sentAt: performance.now()
        });
        if (predictedZone >= 0) {
            this.pool.zone[id] = predictedZone;
            this.pool.order[id] = predictedOrder;
        }
        this.network.sendInput(msg);
        this.relayout();
    }

    relayout() {
        this.layout.rebuild();
        this.layout.apply(this.input.draggedCard);
        this.playable.update(this.canPrepare(), this.view.selfColor);
        this.refreshControls();
    }

    refreshControls() {
        const v = this.view;
        const phase = v.phase;
        const selfReady = this.isSelfReady();
        const oppReady = v.hasFlag(SNAPSHOT_FLAGS.OPP_READY);
        const discardsLeft = v.selfDiscards - this.countPending(INPUT.DISCARD);

        const preparing = phase === GAME_STATES.PLAYING && !selfReady;
        this.hud.setEndTurn(preparing, preparing && this.layout.stack(ZONE.SELF_ATTACK).length > 0);

        let message = null;
        let selectable = -1;
        if (phase === GAME_STATES.PLAYING) {
            if (selfReady && !oppReady) message = 'AGUARDANDO O OPONENTE...';
            else if (!selfReady && v.hasFlag(SNAPSHOT_FLAGS.SELF_DEFENSE_LOCKED)) message = 'SUA DEFESA ESTÁ BLOQUEADA NESTA RODADA!';
        } else if (phase === GAME_STATES.DISCARDING) {
            if (discardsLeft > 0) {
                message = `LIMITE DE MÃO! DOE ${discardsLeft} CARTA(S) AO OPONENTE`;
                selectable = ZONE.SELF_HAND;
            } else if (v.oppDiscards > 0) {
                message = 'O OPONENTE ESTÁ DESCARTANDO...';
            }
        } else if (phase === GAME_STATES.FORCED_DISCARDING) {
            if (discardsLeft > 0) {
                message = `SEM COR EM COMUM! DESCARTE ${discardsLeft} CARTA(S)`;
                selectable = ZONE.SELF_HAND;
            } else if (v.oppDiscards > 0) {
                message = 'O OPONENTE ESTÁ DESCARTANDO...';
            }
        } else if (phase === GAME_STATES.CHOOSING_COLOR && v.hasFlag(SNAPSHOT_FLAGS.OPP_CHOOSING_COLOR)) {
            message = 'O OPONENTE ESTÁ ESCOLHENDO A COR...';
        }
        this.hud.setPhaseMessage(message);
        this.scene.selectableZone = selectable;

        if (phase === GAME_STATES.CHOOSING_COLOR && v.hasFlag(SNAPSHOT_FLAGS.SELF_CHOOSING_COLOR)) {
            this.colorPicker.show(v.colorChoices, (color) => this.chooseColor(color));
        } else {
            this.colorPicker.hide();
        }
    }

    /** Perdedor da rodada (com dano) escolhe a próxima cor; o servidor valida se ela é comum aos dois. */
    chooseColor(color) {
        if (this.view.phase !== GAME_STATES.CHOOSING_COLOR || this.hasPending(INPUT.CHOOSE_COLOR)) return;
        console.log(`[Client] Escolhendo a cor ${CONFIG.COLOR_PALETTES[color].name}.`);
        this.sendInput(INPUT.CHOOSE_COLOR, -1, -1, 0, undefined, { color });
    }

    // --- Input -------------------------------------------------------------

    isSelfReady() {
        return this.view.hasFlag(SNAPSHOT_FLAGS.SELF_READY) || this.hasPending(INPUT.READY);
    }

    canPrepare() {
        if (!this.hasSnapshot || this.cinematics.gameOverShown) return false;
        return this.view.phase === GAME_STATES.PLAYING && !this.isSelfReady();
    }

    isDiscarding() {
        const phase = this.view.phase;
        return this.hasSnapshot
            && (phase === GAME_STATES.DISCARDING || phase === GAME_STATES.FORCED_DISCARDING)
            && this.view.selfDiscards > this.countPending(INPUT.DISCARD);
    }

    setupInput() {
        this.input.init(this.canvas, (x, y) => this.pickCard(x, y), this.pool, this.viewport);
        this.input.onCardPress = (id) => this.onCardPress(id);
        this.input.onDragMove = (id, x, y) => this.onDragMove(id, x, y);
        this.input.onDrop = (id) => this.onDrop(id);
        this.input.onEmptyPress = (x, y) => this.particles.emitBurst(x, y, '#ffffff', 20, 100, PARTICLE_TYPES.SPARK);
    }

    /** Hit-test exato considerando rotação e escala da carta (topo do zIndex primeiro). */
    pickCard(x, y) {
        const pool = this.pool;
        const order = pool.drawOrder;
        for (let n = pool.drawCount - 1; n >= 0; n--) {
            const id = order[n];
            if (pool.active[id] !== 1) continue;
            const dx = x - (pool.x[id] + HALF_W);
            const dy = y - (pool.y[id] + pool.hoverOffsetY[id] + HALF_H);
            const rot = pool.rotation[id];
            const cos = Math.cos(-rot);
            const sin = Math.sin(-rot);
            const scale = pool.scale[id] || 1;
            const lx = (dx * cos - dy * sin) / scale;
            const ly = (dx * sin + dy * cos) / scale;
            if (lx >= -HALF_W && lx <= HALF_W && ly >= -HALF_H && ly <= HALF_H) return id;
        }
        return -1;
    }

    /** Baixa a carta atualmente em hover (se houver) e limpa o rastreio. Idempotente. */
    lowerHover() {
        if (this.hoveredCard === -1) return;
        if (this.pool.isActive(this.hoveredCard)) {
            this.animator.to(this.hoveredCard, { hoverOffsetY: 0 }, ANIM.HOVER, Easing.QuadOut, null, null, this.pool);
        }
        this.hoveredCard = -1;
    }

    onCardPress(id) {
        const pool = this.pool;
        const zone = pool.zone[id];
        // Toque em tela não tem "mousemove" contínuo: sem isso, uma carta tocada antes fica
        // presa levantada pra sempre quando o jogador toca em outra (só existe em celular/tablet).
        this.lowerHover();

        if (this.isDiscarding()) {
            if (zone !== ZONE.SELF_HAND) return false;
            for (const p of this.pendingInputs) if (p.t === INPUT.DISCARD && p.id === id) return false;
            console.log(`[Client] Descartando carta ${id}.`);
            this.audio.play(SFX.HOVER);
            this.sendInput(INPUT.DISCARD, id);
            this.animator.to(id, { scale: 0.7 }, ANIM.HOVER, Easing.QuadOut, null, null, pool);
            return false;
        }

        if (!this.canPrepare()) return false;

        if (zone === ZONE.SELF_ATTACK || zone === ZONE.SELF_DEFENSE) {
            // Retirar do campo: sem som (só "colocar" toca, ver onDrop)
            this.sendInput(INPUT.RECALL_CARD, id, ZONE.SELF_HAND, PREDICTED_HAND_ORDER);
            return false;
        }

        if (zone !== ZONE.SELF_HAND) return false;

        this.audio.play(SFX.HOVER);
        this.animator.cancel(id, pool);
        pool.hoverOffsetY[id] = 0;
        pool.zIndex[id] = DRAG_Z_INDEX;
        this.animator.to(id, { scale: 1.0 }, 150, Easing.QuadOut, null, null, pool);
        return true;
    }

    onDragMove(id, x, y) {
        const pool = this.pool;
        pool.targetX[id] = x;
        pool.targetY[id] = y;
        const zone = this.board.getZoneAt(x + HALF_W, y + HALF_H);
        this.board.highlightZone = this.isValidDrop(id, zone) ? zone : -1;
        pool.rotation[id] = zone === ZONE.SELF_DEFENSE ? Math.PI / 2 : 0;
    }

    isValidDrop(id, zone) {
        return this.playable.slotAccepts(id, zone);
    }

    onDrop(id) {
        const pool = this.pool;
        this.board.highlightZone = -1;
        const zone = this.board.getZoneAt(pool.targetX[id] + HALF_W, pool.targetY[id] + HALF_H);

        if (!this.canPrepare() || !pool.isActive(id) || pool.zone[id] !== ZONE.SELF_HAND || !this.isValidDrop(id, zone)) {
            this.relayout();
            return;
        }

        if (zone === ZONE.SELF_USE) {
            this.audio.playSample(SAMPLES.CARD_HOVER);
            this.sendInput(INPUT.PLAY_CONSUMABLE, id, ZONE.SELF_USE, 0);
            return;
        }

        if (!this.playable.colorAllows(id, zone, this.view.selfColor)) {
            this.shakeBackToHand(id);
            return;
        }

        this.audio.playSample(SAMPLES.CARD_HOVER);
        // Previsão otimista: a carta já vai para o slot; o snapshot com o ack confirma ou corrige
        this.sendInput(INPUT.PLAY_CARD, id, zone, 0, zone);
    }

    /** Cor inválida: a carta treme e volta para a mão (GAME_RULES §5). */
    shakeBackToHand(id) {
        const pool = this.pool;
        const hx = pool.homeX[id];
        const hy = pool.homeY[id];
        const step = ANIM.SHAKE_STEP;
        this.animator.to(id, { targetX: hx - 20, targetY: hy, rotation: 0, scale: CONFIG.HAND_SCALE }, step * 2, Easing.Linear, null, () => {
            this.animator.to(id, { targetX: hx + 20 }, step, Easing.Linear, null, () => {
                this.animator.to(id, { targetX: hx }, step, Easing.Linear, null, () => this.relayout(), pool);
            }, pool);
        }, pool);
    }

    /** @param {string} name nome exibido para você e para o oponente */
    submitName(name) {
        console.log(`[Client] Enviando nome: ${name}`);
        this.network.sendInput({ k: MSG.INPUT, t: INPUT.SET_NAME, name });
        this.hud.setNames(name, null);
        if (!this.hasSnapshot) this.hud.setPhaseMessage('AGUARDANDO O OPONENTE...');
    }

    sendReady() {
        if (!this.canPrepare() || this.layout.stack(ZONE.SELF_ATTACK).length === 0) return;
        console.log('[Client] Finalizando turno (READY).');
        this.sendInput(INPUT.READY, -1);
    }

    // --- Loop --------------------------------------------------------------

    update() {
        if (!this.hasSnapshot || this.input.draggedCard !== -1) return;
        const pool = this.pool;
        const canHover = this.canPrepare() || this.isDiscarding();
        let current = canHover ? this.pickCard(this.input.pointerX, this.input.pointerY) : -1;
        if (current !== -1 && pool.zone[current] !== ZONE.SELF_HAND) current = -1;
        if (current === this.hoveredCard) return;

        this.lowerHover();
        if (current !== -1) {
            this.audio.play(SFX.HOVER);
            this.animator.to(current, { hoverOffsetY: ANIM.HOVER_LIFT }, ANIM.HOVER, Easing.QuadOut, null, null, pool);
        }
        this.hoveredCard = current;
    }

    render(dt) {
        this.animator.update(dt);
        this.particles.update(dt / 1000);
        this.scene.deckX = this.layout.deckX;
        this.scene.deckY = this.layout.deckY;
        this.scene.hoveredCard = this.hoveredCard;
        this.renderer.draw(this.scene, dt);
    }
}
