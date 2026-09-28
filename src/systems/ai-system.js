import { CONFIG } from '../config/constants.js';
import {
    canPlayColor, canPlayOnCombatSlot, consumableBlockReason, isConsumable, pickColorFromMask, purchaseBlockReason, sellValue
} from './rules.js';
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
        // consumableMask: bit (1 << tipo) de cada consumível já avaliado nesta rodada
        this.plan = { round: -1, wantsDefense: false, consumableMask: 0, shopActions: 0, buyChecked: false };

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
        if (v.phase === GAME_STATES.CHOOSING_COLOR) return v.hasFlag(SNAPSHOT_FLAGS.SELF_CHOOSING_COLOR);
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
        if (v.phase === GAME_STATES.CHOOSING_COLOR) {
            // A CPU escolhe ao acaso entre as cores disponíveis (mesmo input de um jogador humano)
            const color = pickColorFromMask(v.colorChoices);
            console.log(`[AISystem:${this.label}] Escolhendo a cor ${CONFIG.COLOR_PALETTES[color].name}.`);
            return { t: INPUT.CHOOSE_COLOR, color };
        }
        this.collectHand();

        if (v.phase === GAME_STATES.DISCARDING || v.phase === GAME_STATES.FORCED_DISCARDING) {
            return this.decideDiscard();
        }
        
        if (v.selfStatus & CONFIG.STATUS.PAINT_PENDING) {
            return this.decidePaint();
        }

        if (this.plan.round !== v.round) {
            this.plan.round = v.round;
            this.plan.wantsDefense = Math.random() < AI.DEFENSE_CHANCE;
            this.plan.consumableMask = 0;
            this.plan.shopActions = 0;
            this.plan.buyChecked = false;
            this.rejections = 0;
        }

        if (this.rejections >= AI.MAX_REJECTIONS) {
            this.rejections = 0;
            return v.countInZone(ZONE.SELF_ATTACK) > 0 ? { t: INPUT.READY } : this.randomAttack();
        }

        const consumable = this.decideConsumable();
        if (consumable) return consumable;

        const economy = this.decideEconomy();
        if (economy) return economy;

        if (v.countInZone(ZONE.SELF_ATTACK) === 0) return this.randomAttack();

        const canDefend = v.countInZone(ZONE.SELF_DEFENSE) === 0 && !v.hasFlag(SNAPSHOT_FLAGS.SELF_DEFENSE_LOCKED);
        if (this.plan.wantsDefense && canDefend && this.defensePlayable.length > 0) {
            this.plan.wantsDefense = false;
            const pick = this.defensePlayable[Math.floor(Math.random() * this.defensePlayable.length)];
            return { t: INPUT.PLAY_CARD, cardId: v.ids[pick], zone: ZONE.SELF_DEFENSE };
        }

        return { t: INPUT.READY };
    }

    /** Avalia cada tipo de consumível da mão uma vez por rodada; usa no máximo um por decisão. */
    decideConsumable() {
        const v = this.view;
        for (const i of this.hand) {
            const type = v.type[i];
            if (!isConsumable(type)) continue;
            const bit = 1 << type;
            if (this.plan.consumableMask & bit) continue;
            this.plan.consumableMask |= bit;
            if (consumableBlockReason(type, v.selfStatus) || !this.wantsConsumable(type)) continue;
            console.log(`[AISystem:${this.label}] Usando consumível do tipo ${type} (vida ${v.selfHP}).`);
            return { t: INPUT.PLAY_CONSUMABLE, cardId: v.ids[i] };
        }
        return null;
    }

    /**
     * Economia da CPU (antes de montar o ataque): vende o número mais fraco se a mão estiver cheia
     * e, uma vez por rodada, compra o melhor item que couber no bolso.
     */
    decideEconomy() {
        const v = this.view;
        if (this.plan.shopActions >= AI.MAX_SHOP_ACTIONS_PER_ROUND) return null;

        if (this.hand.length >= AI.SELL_WHEN_HAND_AT_LEAST) {
            let weakest = -1;
            for (const i of this.hand) {
                if (v.type[i] !== CARD_TYPES.NUMBER || v.power[i] > AI.SELL_MAX_POWER) continue;
                if (sellValue(v.type[i], v.power[i], v.cardFlags[i]) <= 0) continue;
                if (weakest < 0 || v.power[i] < v.power[weakest]) weakest = i;
            }
            if (weakest >= 0) {
                this.plan.shopActions++;
                console.log(`[AISystem:${this.label}] Vendendo um ${v.power[weakest]} na lixeira.`);
                return { t: INPUT.SELL_CARD, cardId: v.ids[weakest] };
            }
        }

        if (!this.plan.buyChecked) {
            this.plan.buyChecked = true;
            if (Math.random() >= AI.BUY_CHANCE) return null;
            const slot = this.bestShopSlot();
            if (slot >= 0) {
                this.plan.shopActions++;
                console.log(`[AISystem:${this.label}] Comprando o item ${slot + 1} da loja (moedas ${v.coins}).`);
                return { t: INPUT.SHOP_BUY, slot };
            }
        }
        return null;
    }

    /** Item mais valioso que dá pra comprar agora (-1 se nenhum). */
    bestShopSlot() {
        const v = this.view;
        const hand = v.handSize();
        let best = -1;
        let bestScore = 0;
        for (let slot = 0; slot < CONFIG.SHOP.SLOTS; slot++) {
            const item = v.shopItem(slot);
            if (purchaseBlockReason(item, v.coins, hand)) continue;
            if (item.type === CARD_TYPES.REVIVE && (v.selfStatus & CONFIG.STATUS.REVIVE_USED)) continue;
            const score = item.type === CARD_TYPES.NUMBER ? item.power : 10 + (item.flags & CONFIG.SHOP_ITEM_FLAGS.DISCOUNT ? 2 : 0);
            if (score > bestScore) {
                bestScore = score;
                best = slot;
            }
        }
        return best;
    }

    wantsConsumable(type) {
        const v = this.view;
        switch (type) {
            case CARD_TYPES.CHANGE_COLOR:
                return v.selfColor !== COLOR.RAINBOW && Math.random() < AI.CONSUMABLE_CHANCE;
            case CARD_TYPES.HEAL:
                return CONFIG.MAX_HP - v.selfHP >= AI.HEAL_MIN_MISSING_HP && Math.random() < AI.CONSUMABLE_CHANCE;
            case CARD_TYPES.SHIELD:
                return v.selfHP <= AI.SHIELD_BELOW_HP || Math.random() < AI.SHIELD_RANDOM_CHANCE;
            case CARD_TYPES.REVIVE:
                return v.selfHP <= AI.REVIVE_BELOW_HP;
            case CARD_TYPES.PAINT: {
                let paintables = 0;
                for (const i of this.hand) {
                    if (v.color[i] !== CONFIG.COLOR.BLACK && v.color[i] !== CONFIG.COLOR.NONE) paintables++;
                }
                return paintables >= CONFIG.CONSUMABLES.PAINT_CARDS_NEEDED && Math.random() < AI.CONSUMABLE_CHANCE;
            }
            default:
                return false;
        }
    }

    randomAttack() {
        const v = this.view;
        if (this.playable.length === 0) {
            // Só o Trocar Cor destrava cartas de outra cor pro ataque
            const changeColor = this.hand.find((i) => v.type[i] === CARD_TYPES.CHANGE_COLOR);
            if (changeColor !== undefined && v.selfColor !== COLOR.RAINBOW) {
                return { t: INPUT.PLAY_CONSUMABLE, cardId: v.ids[changeColor] };
            }
            console.warn(`[AISystem:${this.label}] Sem cartas jogáveis para o ataque.`);
            return null;
        }
        const pick = this.playable[Math.floor(Math.random() * this.playable.length)];
        return { t: INPUT.PLAY_CARD, cardId: v.ids[pick], zone: ZONE.SELF_ATTACK };
    }

    /** Seleciona cartas aleatórias e uma cor para o Pintar. */
    decidePaint() {
        const v = this.view;
        const paintables = [];
        for (const i of this.hand) {
            if (v.color[i] !== CONFIG.COLOR.BLACK && v.color[i] !== CONFIG.COLOR.NONE) paintables.push(i);
        }
        if (paintables.length < CONFIG.CONSUMABLES.PAINT_CARDS_NEEDED) {
            // Travou: não tem cartas pra pintar. Finaliza o turno.
            return { t: INPUT.READY };
        }
        const cards = [];
        for (let i = 0; i < CONFIG.CONSUMABLES.PAINT_CARDS_NEEDED; i++) {
            const idx = Math.floor(Math.random() * paintables.length);
            cards.push(v.ids[paintables[idx]]);
            paintables.splice(idx, 1);
        }
        const colors = CONFIG.BASIC_COLORS;
        const color = colors[Math.floor(Math.random() * colors.length)];
        console.log(`[AISystem:${this.label}] Pintando cartas de ${CONFIG.COLOR_PALETTES[color].name}.`);
        return { t: INPUT.PAINT_SELECT, cards, color };
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
