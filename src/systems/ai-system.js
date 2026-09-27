import { CONFIG } from '../config/constants.js';
import { canPlayColor, canPlayOnCombatSlot, isConsumable } from './rules.js';
import { ZONE } from '../utils/zones.js';
import {
    EVENT, INPUT, MSG, SNAPSHOT_FLAGS, SnapshotView, decodeSnapshot, isBinaryMessage, isSeqAfter
} from '../network/protocol.js';

const { GAME_STATES, CARD_TYPES, AI, COLOR } = CONFIG;

/**
 * AISystem - "jogador invisível". Funciona como um cliente remoto de verdade:
 * faz handshake, recebe apenas o SEU snapshot (cartas do oponente mascaradas) e responde com inputs.
 * Também serve de piloto automático para o jogador local em testes (?autoplay).
 */
export class AISystem {
    /**
     * @param {(message: object) => void} send envia um input ao servidor
     * @param {string} [label] nome usado nos logs
     */
    constructor(send, label = 'CPU') {
        this.send = send;
        this.label = label;
        this.view = new SnapshotView();
        this.hasView = false;
        this.thinking = false;
        this.awaitingUpdate = false;
        this.rejections = 0;
        this.inputSeq = 0;
        this.plan = { round: -1, wantsDefense: false, consumableChecked: false };

        this.hand = [];
        this.playable = [];
        this.defensePlayable = [];
    }

    hello(token = 'local-cpu') {
        this.send({ k: MSG.HELLO, token });
        this.send({ k: MSG.INPUT, t: INPUT.SET_NAME, name: this.label });
    }

    handleMessage(msg) {
        if (isBinaryMessage(msg)) {
            if (!decodeSnapshot(msg, this.view)) return;
            if (!this.hasView) this.inputSeq = this.view.ackSeq;
            this.hasView = true;
            // Só volta a decidir quando o snapshot já reflete o último input enviado
            if (!isSeqAfter(this.inputSeq, this.view.ackSeq)) this.awaitingUpdate = false;
            this.scheduleThink();
            return;
        }
        if (msg && msg.k === MSG.EVENT && msg.t === EVENT.REJECTED) {
            console.warn(`[AISystem:${this.label}] Jogada recusada: ${msg.reason}`);
            this.rejections++;
            if (msg.seq === this.inputSeq) this.awaitingUpdate = false;
            this.scheduleThink();
        }
    }

    needsToAct() {
        const v = this.view;
        if (v.phase === GAME_STATES.PLAYING) return !v.hasFlag(SNAPSHOT_FLAGS.SELF_READY);
        if (v.phase === GAME_STATES.DISCARDING || v.phase === GAME_STATES.FORCED_DISCARDING) return v.selfDiscards > 0;
        if (v.phase === GAME_STATES.GAME_OVER) return !v.hasFlag(SNAPSHOT_FLAGS.SELF_REMATCH);
        return false;
    }

    scheduleThink() {
        if (this.thinking || this.awaitingUpdate || !this.hasView || !this.needsToAct()) return;
        this.thinking = true;
        const delay = this.plan.round === this.view.round ? AI.ACTION_GAP_MS : AI.THINK_MS;
        setTimeout(() => {
            this.thinking = false;
            this.act();
        }, delay);
    }

    act() {
        if (!this.needsToAct()) return;
        const input = this.decide();
        if (!input) return;

        this.inputSeq = (this.inputSeq + 1) & 0xffff;
        input.k = MSG.INPUT;
        input.seq = this.inputSeq;
        this.awaitingUpdate = true;
        console.log(`[AISystem:${this.label}] Enviando input`, input);
        this.send(input);
    }

    collectHand() {
        const v = this.view;
        this.hand.length = 0;
        this.playable.length = 0;
        this.defensePlayable.length = 0;

        let attackIdx = -1;
        for (let i = 0; i < v.cardCount; i++) {
            if (v.zone[i] === ZONE.SELF_ATTACK) attackIdx = i;
        }

        for (let i = 0; i < v.cardCount; i++) {
            if (v.zone[i] !== ZONE.SELF_HAND) continue;
            this.hand.push(i);
            if (isConsumable(v.type[i])) continue;
            if (canPlayColor(v.color[i], v.selfColor)) this.playable.push(i);
            if (canPlayOnCombatSlot(v, i, v.selfColor, attackIdx)) this.defensePlayable.push(i);
        }
    }

    decide() {
        const v = this.view;
        if (v.phase === GAME_STATES.GAME_OVER) {
            // A nova partida recomeça na rodada 1: o plano antigo não pode ser reaproveitado
            this.plan.round = -1;
            console.log(`[AISystem:${this.label}] Pedindo revanche.`);
            return { t: INPUT.REMATCH };
        }
        this.collectHand();

        if (v.phase === GAME_STATES.DISCARDING || v.phase === GAME_STATES.FORCED_DISCARDING) {
            return this.decideDiscard();
        }

        if (this.plan.round !== v.round) {
            this.plan.round = v.round;
            this.plan.wantsDefense = Math.random() < AI.DEFENSE_CHANCE;
            this.plan.consumableChecked = false;
            this.rejections = 0;
        }

        if (this.rejections >= AI.MAX_REJECTIONS) {
            this.rejections = 0;
            return v.countInZone(ZONE.SELF_ATTACK) > 0 ? { t: INPUT.READY } : this.randomAttack();
        }

        if (!this.plan.consumableChecked) {
            this.plan.consumableChecked = true;
            const consumable = this.hand.find((i) => isConsumable(v.type[i]));
            if (consumable !== undefined && v.selfColor !== COLOR.RAINBOW && Math.random() < AI.CONSUMABLE_CHANCE) {
                console.log(`[AISystem:${this.label}] Usando Trocar Cor.`);
                return { t: INPUT.PLAY_CONSUMABLE, cardId: v.ids[consumable] };
            }
        }

        if (v.countInZone(ZONE.SELF_ATTACK) === 0) return this.randomAttack();

        const canDefend = v.countInZone(ZONE.SELF_DEFENSE) === 0 && !v.hasFlag(SNAPSHOT_FLAGS.SELF_DEFENSE_LOCKED);
        if (this.plan.wantsDefense && canDefend && this.defensePlayable.length > 0) {
            this.plan.wantsDefense = false;
            const pick = this.defensePlayable[Math.floor(Math.random() * this.defensePlayable.length)];
            return { t: INPUT.PLAY_CARD, cardId: v.ids[pick], zone: ZONE.SELF_DEFENSE };
        }

        return { t: INPUT.READY };
    }

    randomAttack() {
        const v = this.view;
        if (this.playable.length === 0) {
            const consumable = this.hand.find((i) => isConsumable(v.type[i]));
            if (consumable !== undefined && v.selfColor !== COLOR.RAINBOW) {
                return { t: INPUT.PLAY_CONSUMABLE, cardId: v.ids[consumable] };
            }
            console.warn(`[AISystem:${this.label}] Sem cartas jogáveis para o ataque.`);
            return null;
        }
        const pick = this.playable[Math.floor(Math.random() * this.playable.length)];
        return { t: INPUT.PLAY_CARD, cardId: v.ids[pick], zone: ZONE.SELF_ATTACK };
    }

    /** Descarta (ou doa) a carta numérica mais fraca; especiais são guardadas. */
    decideDiscard() {
        const v = this.view;
        if (this.hand.length === 0) return null;
        let best = this.hand[0];
        let bestScore = Infinity;
        for (const i of this.hand) {
            const score = v.type[i] === CARD_TYPES.NUMBER ? v.power[i] : 100;
            if (score < bestScore) {
                bestScore = score;
                best = i;
            }
        }
        return { t: INPUT.DISCARD, cardId: v.ids[best] };
    }
}
