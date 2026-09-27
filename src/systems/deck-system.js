import { CONFIG } from '../config/constants.js';
import { ZONE } from '../utils/zones.js';

const { CARD_TYPES, COLOR, CARD_SPAWN_WEIGHTS, BASIC_COLORS, NUMBER_RANGE } = CONFIG;

/**
 * DeckSystem - baralho autoritativo (roda só no host).
 * A face de cada carta é sorteada no momento da compra; o descarte é reciclado quando o baralho acaba.
 */
export class DeckSystem {
    /**
     * @param {import('../server/server-state.js').ServerState} state
     * @param {() => number} [random]
     */
    constructor(state, random = Math.random) {
        this.state = state;
        this.random = random;

        let total = 0;
        for (const key in CARD_SPAWN_WEIGHTS.SPECIALS) total += CARD_SPAWN_WEIGHTS.SPECIALS[key];
        this.totalSpecialWeight = total;
        this.totalBaseWeight = CARD_SPAWN_WEIGHTS.NUMBER + CARD_SPAWN_WEIGHTS.SPECIAL_BASE;
    }

    /** Fisher-Yates in-place */
    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(this.random() * (i + 1));
            const temp = array[i];
            array[i] = array[j];
            array[j] = temp;
        }
    }

    reset() {
        this.state.reset();
        this.shuffle(this.state.zones[ZONE.DECK]);
    }

    /**
     * Compra uma carta para a zona informada, sorteando sua face.
     * @param {number} toZone zona absoluta
     * @returns {number} id da carta ou -1 se não houver cartas em jogo
     */
    draw(toZone) {
        const zones = this.state.zones;
        if (zones[ZONE.DECK].length === 0) {
            if (zones[ZONE.DISCARD].length === 0) return -1;
            this.state.moveAll(ZONE.DISCARD, ZONE.DECK);
            this.shuffle(zones[ZONE.DECK]);
        }

        const deck = zones[ZONE.DECK];
        const id = deck[deck.length - 1];
        this.rollFace(id);
        this.state.moveCard(id, toZone);
        return id;
    }

    discard(id) {
        this.state.moveCard(id, ZONE.DISCARD);
    }

    randomBasicColor() {
        return BASIC_COLORS[Math.floor(this.random() * BASIC_COLORS.length)];
    }

    rollFace(id) {
        const s = this.state;
        if (this.random() * this.totalBaseWeight >= CARD_SPAWN_WEIGHTS.SPECIAL_BASE) {
            s.type[id] = CARD_TYPES.NUMBER;
            s.color[id] = this.randomBasicColor();
            s.power[id] = NUMBER_RANGE.MIN + Math.floor(this.random() * (NUMBER_RANGE.MAX - NUMBER_RANGE.MIN + 1));
            return;
        }

        const roll = this.random() * this.totalSpecialWeight;
        let acc = 0;
        let chosen = 'PLUS2';
        for (const key in CARD_SPAWN_WEIGHTS.SPECIALS) {
            acc += CARD_SPAWN_WEIGHTS.SPECIALS[key];
            if (roll < acc) {
                chosen = key;
                break;
            }
        }

        s.type[id] = CARD_TYPES[chosen];
        s.power[id] = 0;
        s.color[id] = (chosen === 'PLUS4' || chosen === 'CHANGE_COLOR') ? COLOR.BLACK : this.randomBasicColor();
    }
}
