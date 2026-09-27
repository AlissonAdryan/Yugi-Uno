import { CONFIG } from '../config/constants.js';
import { ZONE, ZONE_COUNT, ZONE_OFFSET, seatZone, zoneOffset } from '../utils/zones.js';

/**
 * Estado autoritativo da partida (vive apenas no host).
 * Dados numéricos das cartas em SoA/TypedArrays; cada carta está sempre em exatamente uma zona.
 */
export class ServerState {
    constructor(capacity = CONFIG.DECK_SIZE) {
        this.capacity = capacity;

        this.type = new Uint8Array(capacity);
        this.color = new Uint8Array(capacity);
        this.power = new Int16Array(capacity);
        // 1 = face pública para os dois jogadores (revelada em combate)
        this.revealed = new Uint8Array(capacity);
        this.zoneOf = new Uint8Array(capacity);

        this.zones = [];
        for (let z = 0; z < ZONE_COUNT; z++) this.zones.push([]);

        this.hp = new Int16Array(2);
        this.activeColor = new Uint8Array(2);
        this.ready = new Uint8Array(2);
        this.discardsNeeded = new Uint8Array(2);
        this.drawsOwed = new Uint8Array(2);
        this.defenseLock = new Uint8Array(2);
        // 1 = o assento pediu revanche (só faz sentido na fase GAME_OVER)
        this.rematch = new Uint8Array(2);

        this.phase = CONFIG.GAME_STATES.INIT;
        this.round = 0;
        this.winner = -1;
        // Assento que escolhe a próxima cor (-1 = sorteio) e as cores que ele pode escolher (máscara)
        this.colorChooser = -1;
        this.colorChoices = 0;

        this.reset();
    }

    reset() {
        for (let z = 0; z < ZONE_COUNT; z++) this.zones[z].length = 0;
        const deck = this.zones[ZONE.DECK];
        for (let id = 0; id < this.capacity; id++) {
            deck.push(id);
            this.zoneOf[id] = ZONE.DECK;
            this.revealed[id] = 0;
        }
        this.hp.fill(CONFIG.STARTING_HP);
        this.activeColor.fill(CONFIG.COLOR.NONE);
        this.ready.fill(0);
        this.discardsNeeded.fill(0);
        this.drawsOwed.fill(0);
        this.defenseLock.fill(0);
        this.rematch.fill(0);
        this.phase = CONFIG.GAME_STATES.INIT;
        this.round = 0;
        this.winner = -1;
        this.colorChooser = -1;
        this.colorChoices = 0;
    }

    isValidCard(id) {
        return Number.isInteger(id) && id >= 0 && id < this.capacity;
    }

    /** @returns {number[]} array vivo da zona do assento */
    zone(seat, offset) {
        return this.zones[seatZone(seat, offset)];
    }

    handSize(seat) {
        return this.zones[seatZone(seat, ZONE_OFFSET.HAND)].length;
    }

    /** @returns {number} carta do topo da zona ou -1 */
    top(seat, offset) {
        const arr = this.zones[seatZone(seat, offset)];
        return arr.length > 0 ? arr[arr.length - 1] : -1;
    }

    /**
     * Move a carta para o topo (fim) da zona de destino.
     * Entrar em mão/baralho/descarte torna a carta secreta novamente.
     */
    moveCard(id, toZone) {
        const from = this.zones[this.zoneOf[id]];
        const idx = from.lastIndexOf(id);
        if (idx > -1) from.splice(idx, 1);

        this.zones[toZone].push(id);
        this.zoneOf[id] = toZone;

        if (toZone === ZONE.DECK || toZone === ZONE.DISCARD || zoneOffset(toZone) === ZONE_OFFSET.HAND) {
            this.revealed[id] = 0;
        }
    }

    /** Move todas as cartas preservando a ordem da pilha. */
    moveAll(fromZone, toZone) {
        const src = this.zones[fromZone];
        while (src.length > 0) this.moveCard(src[0], toZone);
    }

    /** Máscara de bits das cores presentes na mão (ver rules.colorBit). */
    handColorMask(seat, colorBit) {
        const hand = this.zone(seat, ZONE_OFFSET.HAND);
        let mask = 0;
        for (let i = 0; i < hand.length; i++) mask |= colorBit(this.color[hand[i]]);
        return mask;
    }
}
