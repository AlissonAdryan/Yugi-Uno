import { CONFIG } from '../config/constants.js';
import { ServerState } from './server-state.js';
import { ServerCombat } from './server-combat.js';
import { DeckSystem } from '../systems/deck-system.js';
import {
    canPlayOnCombatSlot, colorBit, colorCount, handLimitExcess, isConsumable, pickColorFromMask, roundDrawsFor
} from '../systems/rules.js';
import {
    SEAT, ZONE_OFFSET, isCombatOffset, isValidZone, mirrorZone, seatZone, zoneOffset, zoneSeat
} from '../utils/zones.js';
import {
    EVENT, END_REASON, GAME_RESULT, INPUT, MSG, SNAPSHOT_MAX_BYTES,
    encodeSnapshot, localizeEvent, snapshotsEqual, writeSnapshotSeq
} from '../network/protocol.js';
import { NET_EVENT } from '../network/network-system.js';

const { GAME_STATES, TIMINGS, COLOR } = CONFIG;
const SEATS = [SEAT.P1, SEAT.P2];
const INPUT_NAMES = Object.fromEntries(Object.entries(INPUT).map(([k, v]) => [v, k]));

/**
 * ServerEngine - fonte única da verdade (roda no host).
 *
 * Regras de ordenação das mensagens:
 *  - Mutações chamam markDirty(); o snapshot sai num microtask (várias mutações = 1 snapshot).
 *  - emit()/emitTo() SEMPRE enviam antes o snapshot pendente. Assim um evento descreve a transição
 *    a partir do último estado já entregue, e a mutação correspondente é feita logo após o emit.
 */
export class ServerEngine {
    /**
     * @param {import('../network/network-system.js').NetworkSystem} network
     */
    constructor(network) {
        this.network = network;
        this.state = new ServerState();
        this.deck = new DeckSystem(this.state);
        this.combat = new ServerCombat(this.state, this.deck, this);

        this.scratch = new DataView(new ArrayBuffer(SNAPSHOT_MAX_BYTES));
        this.snapshotSeq = [0, 0];
        this.lastInputSeq = [0, 0];
        this.lastSnapshot = [null, null];
        this.flushPending = false;
        this.timers = new Set();
        this.names = ['', ''];
        this.startRequested = false;
        // Invalida timeouts de escolha de cor antigos (cada abertura da escolha gera um novo token)
        this.colorChoiceToken = 0;

        this._flushMicrotask = () => {
            if (!this.flushPending) return;
            this.flushPending = false;
            this.flushNow();
        };

        network.on(NET_EVENT.INPUT, (seat, msg) => this.handleInput(seat, msg));
        network.on(NET_EVENT.SEAT_CONNECTED, (seat) => this.sendFullSync(seat));
        network.on(NET_EVENT.SEAT_LOST, (seat) => this.endByAbandon(seat));
    }

    // --- Ciclo da partida ---------------------------------------------------

    /** Inicia a partida assim que os dois jogadores tiverem informado o nome. */
    start() {
        if (this.state.phase !== GAME_STATES.INIT) return;
        if (!this.names[SEAT.P1] || !this.names[SEAT.P2]) {
            this.startRequested = true;
            console.log('[Server] Aguardando os nomes dos jogadores para iniciar...');
            return;
        }
        this.startRequested = false;
        console.log(`[Server] Iniciando partida: ${this.names[SEAT.P1]} x ${this.names[SEAT.P2]}`);
        this.deck.reset();

        for (let i = 0; i < CONFIG.INITIAL_HAND_SIZE; i++) {
            for (const seat of SEATS) this.deck.draw(seatZone(seat, ZONE_OFFSET.HAND));
        }
        this.markDirty();
        this.schedule(() => this.beginColorDraw(), TIMINGS.NEXT_ROUND_DELAY);
    }

    isGameOver() {
        return this.state.phase === GAME_STATES.GAME_OVER;
    }

    beginColorDraw() {
        if (this.isGameOver()) return;
        const s = this.state;

        for (const seat of SEATS) {
            if (s.handSize(seat) === 0) {
                console.warn(`[Server] P${seat + 1} sem cartas no sorteio de cor. Comprando 1 de emergência.`);
                this.deck.draw(seatZone(seat, ZONE_OFFSET.HAND));
            }
        }

        const common = s.handColorMask(SEAT.P1, colorBit) & s.handColorMask(SEAT.P2, colorBit);
        if (common !== 0) {
            // Só abre a escolha se houver o que escolher; com uma única cor em comum, ela já é a cor
            if (s.colorChooser >= 0 && colorCount(common) > 1) {
                this.openColorChoice(common);
                return;
            }
            const color = pickColorFromMask(common);
            console.log(`[Server] Rodada ${s.round + 1}: cor sorteada ${CONFIG.COLOR_PALETTES[color].name}`);
            this.commitColor(color);
            return;
        }

        console.warn('[Server] Nenhuma cor em comum. Entrando em Descarte Forçado.');
        s.phase = GAME_STATES.FORCED_DISCARDING;
        s.activeColor.fill(COLOR.NONE);
        for (const seat of SEATS) {
            const count = Math.min(CONFIG.FORCED_DISCARD_COUNT, s.handSize(seat));
            s.discardsNeeded[seat] = count;
            s.drawsOwed[seat] = count;
        }
        this.markDirty();
    }

    /** O perdedor da rodada escolhe a cor entre as cores em comum (as demais ficam indisponíveis). */
    openColorChoice(common) {
        const s = this.state;
        const seat = s.colorChooser;
        console.log(`[Server] Rodada ${s.round + 1}: P${seat + 1} escolhe a cor (máscara ${common.toString(2)}).`);
        s.colorChoices = common;
        s.phase = GAME_STATES.CHOOSING_COLOR;
        this.markDirty();

        const token = ++this.colorChoiceToken;
        this.schedule(() => {
            if (s.phase !== GAME_STATES.CHOOSING_COLOR || token !== this.colorChoiceToken) return;
            const color = pickColorFromMask(s.colorChoices);
            console.warn(`[Server] P${seat + 1} não escolheu a tempo. Cor sorteada: ${CONFIG.COLOR_PALETTES[color].name}`);
            this.commitColor(color);
        }, TIMINGS.COLOR_CHOICE_TIMEOUT);
    }

    /** Define a cor da rodada (sorteada ou escolhida) e abre a fase de preparação. */
    commitColor(color) {
        const s = this.state;
        this.emit(EVENT.COLOR_CHOSEN, { color });
        s.activeColor[SEAT.P1] = color;
        s.activeColor[SEAT.P2] = color;
        s.ready.fill(0);
        s.discardsNeeded.fill(0);
        s.colorChooser = -1;
        s.colorChoices = 0;
        this.colorChoiceToken++;
        s.round++;
        s.phase = GAME_STATES.PLAYING;
        this.markDirty();
    }

    async runCombat() {
        const s = this.state;
        console.log(`[Server] Ambos prontos. Resolvendo combate da rodada ${s.round}...`);
        s.phase = GAME_STATES.COMBAT_RESOLUTION;
        for (const seat of SEATS) {
            if (s.defenseLock[seat] > 0) s.defenseLock[seat]--;
        }
        this.markDirty();

        const outcome = await this.combat.resolve();
        if (this.isGameOver()) return;

        if (outcome.gameWinner >= 0) {
            this.finishGame(outcome.gameWinner, END_REASON.HP);
            return;
        }

        // Quem perdeu a rodada levando dano (-X ♥) escolhe a próxima cor; sem dano, a cor é sorteada
        const loser = outcome.roundWinner >= 0 ? 1 - outcome.roundWinner : -1;
        s.colorChooser = loser >= 0 && this.combat.damageTaken[loser] > 0 ? loser : -1;
        if (s.colorChooser >= 0) console.log(`[Server] P${loser + 1} levou dano: vai escolher a próxima cor.`);

        await this.sleep(TIMINGS.ROUND_END_PAUSE);
        if (this.isGameOver()) return;
        this.startDrawPhase(outcome.roundWinner);
    }

    startDrawPhase(roundWinner) {
        const s = this.state;
        let anyDiscard = false;
        for (const seat of SEATS) {
            const draws = roundDrawsFor(seat, roundWinner);
            s.drawsOwed[seat] = draws;
            s.discardsNeeded[seat] = handLimitExcess(s.handSize(seat), draws);
            if (s.discardsNeeded[seat] > 0) anyDiscard = true;
        }

        if (anyDiscard) {
            console.log(`[Server] Limite de mão excedido. Descartes (doação): P1=${s.discardsNeeded[0]} P2=${s.discardsNeeded[1]}`);
            s.phase = GAME_STATES.DISCARDING;
            this.markDirty();
            return;
        }
        this.finishRoundDraw();
    }

    finishRoundDraw() {
        const s = this.state;
        for (const seat of SEATS) {
            const room = Math.max(0, CONFIG.MAX_HAND_SIZE - s.handSize(seat));
            const count = Math.min(s.drawsOwed[seat], room);
            for (let i = 0; i < count; i++) this.deck.draw(seatZone(seat, ZONE_OFFSET.HAND));
            s.drawsOwed[seat] = 0;
        }
        console.log(`[Server] Compras da rodada feitas. Mãos: P1=${s.handSize(0)} P2=${s.handSize(1)}`);
        this.markDirty();
        this.schedule(() => this.beginColorDraw(), TIMINGS.NEXT_ROUND_DELAY);
    }

    finishForcedDiscard() {
        const s = this.state;
        for (const seat of SEATS) {
            for (let i = 0; i < s.drawsOwed[seat]; i++) this.deck.draw(seatZone(seat, ZONE_OFFSET.HAND));
            s.drawsOwed[seat] = 0;
        }
        console.log('[Server] Descarte Forçado concluído. Novo sorteio de cor em breve.');
        this.markDirty();
        this.schedule(() => this.beginColorDraw(), TIMINGS.FORCED_REDRAW_DELAY);
    }

    finishGame(winnerSeat, reason) {
        const s = this.state;
        if (this.isGameOver()) return;
        console.log(`[Server] FIM DE JOGO. Vencedor: P${winnerSeat + 1} (motivo: ${reason === END_REASON.HP ? 'vida' : 'abandono'})`);
        this.clearTimers();
        s.winner = winnerSeat;
        for (const seat of SEATS) {
            this.emitTo(seat, EVENT.GAME_OVER, {
                result: seat === winnerSeat ? GAME_RESULT.VICTORY : GAME_RESULT.DEFEAT,
                reason
            });
        }
        s.phase = GAME_STATES.GAME_OVER;
        this.markDirty();
    }

    /** Revanche: cada jogador pede uma vez; com os dois pedidos, a mesma sala começa uma partida nova. */
    requestRematch(seat) {
        const s = this.state;
        if (s.phase !== GAME_STATES.GAME_OVER) return 'WRONG_PHASE';
        if (s.rematch[seat]) return null;

        s.rematch[seat] = 1;
        console.log(`[Server] P${seat + 1} pediu revanche (P1=${s.rematch[SEAT.P1]} P2=${s.rematch[SEAT.P2]}).`);
        this.markDirty();
        if (s.rematch[SEAT.P1] && s.rematch[SEAT.P2]) this.restartMatch();
        return null;
    }

    restartMatch() {
        console.log('[Server] Revanche aceita pelos dois jogadores. Reiniciando a partida...');
        this.clearTimers();
        // start() só roda a partir de INIT; o reset completo do estado acontece dentro dele (deck.reset)
        this.state.phase = GAME_STATES.INIT;
        this.start();
    }

    endByAbandon(seat) {
        const phase = this.state.phase;
        if (phase === GAME_STATES.INIT || phase === GAME_STATES.GAME_OVER) return;
        console.warn(`[Server] P${seat + 1} abandonou a partida (timeout de reconexão).`);
        this.finishGame(1 - seat, END_REASON.ABANDON);
    }

    // --- Inputs ------------------------------------------------------------

    /**
     * @param {number} seat assento absoluto de quem enviou
     * @param {object} msg { k: MSG.INPUT, t: INPUT.*, cardId?, zone? }
     */
    handleInput(seat, msg) {
        if (!msg || msg.k !== MSG.INPUT) return;
        console.log(`[Server] Input ${INPUT_NAMES[msg.t] || msg.t} de P${seat + 1}`, msg);
        const seq = Number.isInteger(msg.seq) ? msg.seq & 0xffff : this.lastInputSeq[seat];
        this.lastInputSeq[seat] = seq;

        let reason;
        switch (msg.t) {
            case INPUT.PLAY_CARD: reason = this.playCard(seat, msg.cardId, msg.zone); break;
            case INPUT.RECALL_CARD: reason = this.recallCard(seat, msg.cardId); break;
            case INPUT.PLAY_CONSUMABLE: reason = this.playConsumable(seat, msg.cardId); break;
            case INPUT.READY: reason = this.setReady(seat); break;
            case INPUT.DISCARD: reason = this.discardCard(seat, msg.cardId); break;
            case INPUT.SET_NAME: reason = this.setName(seat, msg.name); break;
            case INPUT.REMATCH: reason = this.requestRematch(seat); break;
            case INPUT.CHOOSE_COLOR: reason = this.chooseColor(seat, msg.color); break;
            default: reason = 'UNKNOWN_INPUT';
        }

        if (reason) {
            console.warn(`[Server] Input rejeitado de P${seat + 1}: ${reason}`);
            this.emitTo(seat, EVENT.REJECTED, {
                input: msg.t,
                seq,
                cardId: Number.isInteger(msg.cardId) ? msg.cardId : -1,
                reason
            });
        }
    }

    chooseColor(seat, color) {
        const s = this.state;
        if (s.phase !== GAME_STATES.CHOOSING_COLOR) return 'WRONG_PHASE';
        if (s.colorChooser !== seat) return 'NOT_YOUR_CHOICE';
        if (!Number.isInteger(color) || (s.colorChoices & colorBit(color)) === 0) return 'COLOR_NOT_AVAILABLE';

        console.log(`[Server] P${seat + 1} escolheu a cor ${CONFIG.COLOR_PALETTES[color].name}.`);
        this.commitColor(color);
        return null;
    }

    setName(seat, raw) {
        if (typeof raw !== 'string') return 'INVALID_NAME';
        const clean = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, CONFIG.NAME_MAX_LENGTH);
        this.names[seat] = clean || `JOGADOR ${seat + 1}`;
        console.log(`[Server] P${seat + 1} agora se chama "${this.names[seat]}".`);
        for (const s of SEATS) this.sendNames(s);

        if (this.startRequested && this.names[SEAT.P1] && this.names[SEAT.P2]) this.start();
        return null;
    }

    sendNames(seat) {
        this.emitTo(seat, EVENT.PLAYER_NAMES, { selfName: this.names[seat], oppName: this.names[1 - seat] });
    }

    canPrepare(seat) {
        const s = this.state;
        if (s.phase !== GAME_STATES.PLAYING) return 'WRONG_PHASE';
        if (s.ready[seat]) return 'ALREADY_READY';
        return null;
    }

    isInHand(seat, cardId) {
        return this.state.isValidCard(cardId) && this.state.zoneOf[cardId] === seatZone(seat, ZONE_OFFSET.HAND);
    }

    playCard(seat, cardId, relZone) {
        const s = this.state;
        const phaseError = this.canPrepare(seat);
        if (phaseError) return phaseError;
        if (!this.isInHand(seat, cardId)) return 'NOT_IN_HAND';
        if (!isValidZone(relZone)) return 'INVALID_ZONE';

        const zone = mirrorZone(relZone, seat);
        const offset = zoneOffset(zone);
        if (zoneSeat(zone) !== seat || !isCombatOffset(offset)) return 'INVALID_ZONE';
        if (s.zones[zone].length > 0) return 'SLOT_OCCUPIED';
        if (offset === ZONE_OFFSET.DEFENSE && s.defenseLock[seat] > 0) return 'DEFENSE_LOCKED';
        if (isConsumable(s.type[cardId])) return 'CONSUMABLE_ONLY_IN_USE_SLOT';
        const attackId = offset === ZONE_OFFSET.DEFENSE ? s.top(seat, ZONE_OFFSET.ATTACK) : -1;
        if (!canPlayOnCombatSlot(s, cardId, s.activeColor[seat], attackId)) return 'WRONG_COLOR';

        if (attackId >= 0 && !canPlayOnCombatSlot(s, cardId, s.activeColor[seat], -1)) {
            console.log(`[Server] P${seat + 1} usou o Espelho de Defesa com a carta ${cardId}.`);
        }
        s.moveCard(cardId, zone);
        this.markDirty();
        return null;
    }

    recallCard(seat, cardId) {
        const s = this.state;
        const phaseError = this.canPrepare(seat);
        if (phaseError) return phaseError;
        if (!s.isValidCard(cardId)) return 'INVALID_CARD';

        const zone = s.zoneOf[cardId];
        if (zoneSeat(zone) !== seat || !isCombatOffset(zoneOffset(zone))) return 'NOT_ON_BOARD';

        s.moveCard(cardId, seatZone(seat, ZONE_OFFSET.HAND));
        if (zoneOffset(zone) === ZONE_OFFSET.ATTACK) this.revalidateDefense(seat);
        this.markDirty();
        return null;
    }

    /** Uma Defesa espelhada depende do Ataque: sem ele, volta para a mão se a cor não permitir. */
    revalidateDefense(seat) {
        const s = this.state;
        const defenseId = s.top(seat, ZONE_OFFSET.DEFENSE);
        if (defenseId < 0) return;
        if (canPlayOnCombatSlot(s, defenseId, s.activeColor[seat], s.top(seat, ZONE_OFFSET.ATTACK))) return;
        console.log(`[Server] Ataque de P${seat + 1} retirado: Defesa espelhada ${defenseId} volta para a mão.`);
        s.moveCard(defenseId, seatZone(seat, ZONE_OFFSET.HAND));
    }

    playConsumable(seat, cardId) {
        const s = this.state;
        const phaseError = this.canPrepare(seat);
        if (phaseError) return phaseError;
        if (!this.isInHand(seat, cardId)) return 'NOT_IN_HAND';
        if (!isConsumable(s.type[cardId])) return 'NOT_CONSUMABLE';
        if (s.zone(seat, ZONE_OFFSET.USE).length > 0) return 'USE_SLOT_BUSY';

        s.moveCard(cardId, seatZone(seat, ZONE_OFFSET.USE));
        this.emit(EVENT.CONSUMABLE_USED, { cardId, seat });
        this.emitTo(seat, EVENT.RAINBOW, {});

        this.deck.discard(cardId);
        s.activeColor[seat] = COLOR.RAINBOW;
        console.log(`[Server] P${seat + 1} usou Trocar Cor -> Arco-Íris até o fim do turno.`);
        this.markDirty();
        return null;
    }

    setReady(seat) {
        const s = this.state;
        const phaseError = this.canPrepare(seat);
        if (phaseError) return phaseError;
        if (s.zone(seat, ZONE_OFFSET.ATTACK).length === 0) return 'ATTACK_REQUIRED';

        s.ready[seat] = 1;
        this.markDirty();
        if (s.ready[SEAT.P1] && s.ready[SEAT.P2]) {
            this.runCombat().catch((err) => console.error('[Server] Erro no combate:', err));
        }
        return null;
    }

    discardCard(seat, cardId) {
        const s = this.state;
        const forced = s.phase === GAME_STATES.FORCED_DISCARDING;
        if (!forced && s.phase !== GAME_STATES.DISCARDING) return 'WRONG_PHASE';
        if (s.discardsNeeded[seat] === 0) return 'NO_DISCARD_NEEDED';
        if (!this.isInHand(seat, cardId)) return 'NOT_IN_HAND';

        const opp = 1 - seat;
        if (forced || s.handSize(opp) >= CONFIG.MAX_HAND_SIZE) {
            this.emit(EVENT.DESTROY, { cardIds: [cardId] });
            this.deck.discard(cardId);
        } else {
            console.log(`[Server] P${seat + 1} doou a carta ${cardId} para P${opp + 1}.`);
            s.moveCard(cardId, seatZone(opp, ZONE_OFFSET.HAND));
        }

        s.discardsNeeded[seat]--;
        this.markDirty();

        if (s.discardsNeeded[SEAT.P1] === 0 && s.discardsNeeded[SEAT.P2] === 0) {
            if (forced) this.finishForcedDiscard();
            else this.finishRoundDraw();
        }
        return null;
    }

    // --- Saída de rede -----------------------------------------------------

    markDirty() {
        if (this.flushPending) return;
        this.flushPending = true;
        queueMicrotask(this._flushMicrotask);
    }

    flushNow() {
        for (const seat of SEATS) this.sendSnapshot(seat, false);
    }

    flushPendingState() {
        if (!this.flushPending) return;
        this.flushPending = false;
        this.flushNow();
    }

    sendSnapshot(seat, force) {
        const bytes = encodeSnapshot(this.state, seat, 0, this.lastInputSeq[seat], this.scratch);
        if (!force && snapshotsEqual(bytes, this.lastSnapshot[seat])) return;

        this.snapshotSeq[seat] = (this.snapshotSeq[seat] + 1) & 0xffff;
        writeSnapshotSeq(bytes, this.snapshotSeq[seat]);
        this.lastSnapshot[seat] = bytes;
        this.network.sendToSeat(seat, bytes);
    }

    sendFullSync(seat) {
        if (this.names[SEAT.P1] || this.names[SEAT.P2]) this.sendNames(seat);
        if (this.state.phase === GAME_STATES.INIT) return;
        console.log(`[Server] Enviando resincronização completa para P${seat + 1}.`);
        this.flushPendingState();
        this.sendSnapshot(seat, true);
    }

    /** Evento para os dois jogadores (o campo `seat` é convertido para relativo). */
    emit(type, data) {
        this.flushPendingState();
        const event = Object.assign({ k: MSG.EVENT, t: type }, data);
        for (const seat of SEATS) this.network.sendToSeat(seat, localizeEvent(event, seat));
    }

    /** Evento apenas para um jogador. */
    emitTo(seat, type, data) {
        this.flushPendingState();
        const event = Object.assign({ k: MSG.EVENT, t: type }, data);
        this.network.sendToSeat(seat, localizeEvent(event, seat));
    }

    // --- Tempo -------------------------------------------------------------

    schedule(fn, ms) {
        const id = setTimeout(() => {
            this.timers.delete(id);
            fn();
        }, ms);
        this.timers.add(id);
    }

    sleep(ms) {
        return new Promise((resolve) => this.schedule(resolve, ms));
    }

    clearTimers() {
        for (const id of this.timers) clearTimeout(id);
        this.timers.clear();
    }
}
