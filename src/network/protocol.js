import { CONFIG } from '../config/constants.js';
import { ZONE, ZONE_COUNT, mirrorZone, zoneSeat } from '../utils/zones.js';

/**
 * Contrato de rede entre Host (servidor autoritativo) e clientes.
 *
 * Servidor -> cliente:
 *   - Snapshot binário (Uint8Array/ArrayBuffer, 1º byte = MSG.SNAPSHOT): estado completo JÁ FILTRADO
 *     para quem vai receber (cartas ocultas vão mascaradas). Enviado só quando o estado muda,
 *     então cada snapshot também é uma resincronização completa.
 *   - Evento JSON { k: MSG.EVENT, t: EVENT.*, ...campos }: cinemáticas e avisos, na ordem exata em que
 *     devem ser tocados. O campo `seat` já chega relativo (0 = você, 1 = oponente).
 *   - { k: MSG.WELCOME, seat } / { k: MSG.ROOM_FULL } no handshake.
 *
 * Cliente -> servidor:
 *   - { k: MSG.HELLO, token }: handshake/reconexão (o token prende o assento ao mesmo jogador).
 *   - { k: MSG.INPUT, t: INPUT.*, seq, cardId?, zone? }: intenção de jogada (zona relativa ao jogador).
 *     `seq` (u16 crescente) volta no snapshot como ack, permitindo reconciliar a previsão local.
 *
 * Todo tráfego usa o canal confiável e ordenado do Trystero (um único RTCDataChannel por par),
 * o que garante que eventos e snapshots cheguem na mesma ordem em que o host os gerou.
 */

export const PROTOCOL_VERSION = 1;

export const MSG = Object.freeze({
    SNAPSHOT: 1,
    EVENT: 2,
    INPUT: 3,
    HELLO: 4,
    WELCOME: 5,
    ROOM_FULL: 6
});

export const INPUT = Object.freeze({
    PLAY_CARD: 1,
    RECALL_CARD: 2,
    PLAY_CONSUMABLE: 3,
    READY: 4,
    DISCARD: 5,
    SET_NAME: 6,         // { name }  (aceito em qualquer fase, sem seq)
    REMATCH: 7           // {}  (só na fase GAME_OVER; com os dois pedidos, uma nova partida começa)
});

export const EVENT = Object.freeze({
    COLOR_CHOSEN: 1,     // { color }
    RAINBOW: 2,          // {}  (só para quem usou o Trocar Cor)
    CONSUMABLE_USED: 3,  // { cardId, seat }
    REVEAL: 4,           // { cards: CardFace[] }
    SUMMON: 5,           // { cardId, seat, count }
    CLASH: 6,            // { winnerId, loserId, winnerPower }
    TIE: 7,              // { cardIds: number[] }
    BLOCK_SMASH: 8,      // { blockId, victimIds: number[] }
    REVERSE_STEAL: 9,    // { reverseId, seat }
    REVERSE_SWAP: 10,    // { reverseId, seat }
    DIRECT_HIT: 11,      // { cardId, seat, damage, effect }
    DESTROY: 12,         // { cardIds: number[] }
    GAME_OVER: 13,       // { result, reason }  (enviado separadamente para cada jogador)
    REJECTED: 14,        // { input, seq, cardId, reason }  (só para quem enviou o input)
    PLAYER_NAMES: 15     // { selfName, oppName }  (enviado a cada jogador na sua perspectiva)
});

export const HIT_EFFECT = Object.freeze({ NONE: 0, LOCKOUT: 1, HAND_SWAP: 2 });
export const GAME_RESULT = Object.freeze({ NONE: 0, VICTORY: 1, DEFEAT: 2 });
export const END_REASON = Object.freeze({ HP: 0, ABANDON: 1 });
export const REL_SEAT = Object.freeze({ SELF: 0, OPPONENT: 1 });

export const SNAPSHOT_FLAGS = Object.freeze({
    SELF_READY: 1,
    OPP_READY: 2,
    SELF_DEFENSE_LOCKED: 4,
    OPP_DEFENSE_LOCKED: 8,
    SELF_REMATCH: 16,
    OPP_REMATCH: 32
});

/**
 * @typedef {{ id: number, type: number, color: number, power: number }} CardFace
 */

/** Comparação de sequência u16 com wrap-around: true se `a` veio depois de `b`. */
export function isSeqAfter(a, b) {
    const diff = (a - b) & 0xffff;
    return diff !== 0 && diff < 0x8000;
}

export function isBinaryMessage(msg) {
    return msg instanceof ArrayBuffer || ArrayBuffer.isView(msg);
}

/**
 * Cria o evento como visto por um assento específico (converte `seat` absoluto em relativo).
 * @param {object} event evento com `seat` absoluto (opcional)
 * @param {number} viewerSeat
 */
export function localizeEvent(event, viewerSeat) {
    if (event.seat === undefined) return event;
    const copy = Object.assign({}, event);
    copy.seat = event.seat === viewerSeat ? REL_SEAT.SELF : REL_SEAT.OPPONENT;
    return copy;
}

// --- Snapshot binário -------------------------------------------------------
// Header (22 bytes, big-endian):
//  0 u8 MSG.SNAPSHOT | 1 u8 versão | 2 u16 seq | 4 u8 fase | 5 u16 rodada
//  7 i16 HP próprio | 9 i16 HP oponente | 11 u8 cor ativa própria | 12 u8 flags
// 13 u8 descartes próprios | 14 u8 descartes do oponente | 15 u8 resultado
// 16 u16 cartas no baralho | 18 u16 quantidade de cartas | 20 u16 último input processado (ack)
// Carta (7 bytes): u16 id | u8 zona relativa | u8 ordem na zona | u8 tipo | u8 cor | i8 poder
// A cor ativa do oponente NÃO é enviada (o uso de Trocar Cor é secreto).

const HEADER_BYTES = 22;
const CARD_BYTES = 7;
const SEQ_OFFSET = 2;
export const SNAPSHOT_MAX_BYTES = HEADER_BYTES + CARD_BYTES * CONFIG.DECK_SIZE;

/** Snapshot decodificado, pré-alocado e reutilizado (zero alocação por atualização). */
export class SnapshotView {
    constructor(capacity = CONFIG.DECK_SIZE) {
        this.capacity = capacity;
        this.seq = 0;
        this.phase = CONFIG.GAME_STATES.INIT;
        this.round = 0;
        this.selfHP = CONFIG.STARTING_HP;
        this.oppHP = CONFIG.STARTING_HP;
        this.selfColor = CONFIG.COLOR.NONE;
        this.flags = 0;
        this.selfDiscards = 0;
        this.oppDiscards = 0;
        this.result = GAME_RESULT.NONE;
        this.deckCount = 0;
        this.cardCount = 0;
        this.ackSeq = 0;
        this.ids = new Uint16Array(capacity);
        this.zone = new Uint8Array(capacity);
        this.order = new Uint8Array(capacity);
        this.type = new Uint8Array(capacity);
        this.color = new Uint8Array(capacity);
        this.power = new Int8Array(capacity);
    }

    hasFlag(flag) {
        return (this.flags & flag) !== 0;
    }

    /** Conta cartas em uma zona relativa. */
    countInZone(zone) {
        let n = 0;
        for (let i = 0; i < this.cardCount; i++) if (this.zone[i] === zone) n++;
        return n;
    }
}

/**
 * Serializa o estado do servidor como visto por `viewerSeat`.
 * @param {import('../server/server-state.js').ServerState} state
 * @param {number} viewerSeat
 * @param {number} seq
 * @param {number} ackSeq último input do jogador já processado pelo servidor
 * @param {DataView} scratch buffer de trabalho com SNAPSHOT_MAX_BYTES
 * @returns {Uint8Array} cópia independente pronta para envio
 */
export function encodeSnapshot(state, viewerSeat, seq, ackSeq, scratch) {
    const oppSeat = 1 - viewerSeat;
    const hidden = CONFIG.CARD_TYPES.HIDDEN;
    let offset = HEADER_BYTES;
    let count = 0;

    for (let zone = ZONE.SELF_HAND; zone < ZONE_COUNT; zone++) {
        const cards = state.zones[zone];
        if (cards.length === 0) continue;
        const relZone = mirrorZone(zone, viewerSeat);
        const isOwn = zoneSeat(zone) === viewerSeat;

        for (let i = 0; i < cards.length; i++) {
            const id = cards[i];
            const visible = isOwn || state.revealed[id] === 1;
            scratch.setUint16(offset, id);
            scratch.setUint8(offset + 2, relZone);
            scratch.setUint8(offset + 3, i > 255 ? 255 : i);
            scratch.setUint8(offset + 4, visible ? state.type[id] : hidden);
            scratch.setUint8(offset + 5, visible ? state.color[id] : 0);
            scratch.setInt8(offset + 6, visible ? state.power[id] : 0);
            offset += CARD_BYTES;
            count++;
        }
    }

    let flags = 0;
    if (state.ready[viewerSeat]) flags |= SNAPSHOT_FLAGS.SELF_READY;
    if (state.ready[oppSeat]) flags |= SNAPSHOT_FLAGS.OPP_READY;
    if (state.defenseLock[viewerSeat] > 0) flags |= SNAPSHOT_FLAGS.SELF_DEFENSE_LOCKED;
    if (state.defenseLock[oppSeat] > 0) flags |= SNAPSHOT_FLAGS.OPP_DEFENSE_LOCKED;
    if (state.rematch[viewerSeat]) flags |= SNAPSHOT_FLAGS.SELF_REMATCH;
    if (state.rematch[oppSeat]) flags |= SNAPSHOT_FLAGS.OPP_REMATCH;

    let result = GAME_RESULT.NONE;
    if (state.winner >= 0) result = state.winner === viewerSeat ? GAME_RESULT.VICTORY : GAME_RESULT.DEFEAT;

    scratch.setUint8(0, MSG.SNAPSHOT);
    scratch.setUint8(1, PROTOCOL_VERSION);
    scratch.setUint16(SEQ_OFFSET, seq);
    scratch.setUint8(4, state.phase);
    scratch.setUint16(5, state.round);
    scratch.setInt16(7, state.hp[viewerSeat]);
    scratch.setInt16(9, state.hp[oppSeat]);
    scratch.setUint8(11, state.activeColor[viewerSeat]);
    scratch.setUint8(12, flags);
    scratch.setUint8(13, state.discardsNeeded[viewerSeat]);
    scratch.setUint8(14, state.discardsNeeded[oppSeat]);
    scratch.setUint8(15, result);
    scratch.setUint16(16, state.zones[ZONE.DECK].length);
    scratch.setUint16(18, count);
    scratch.setUint16(20, ackSeq);

    return new Uint8Array(scratch.buffer.slice(0, offset));
}

/** Compara dois snapshots ignorando o número de sequência. */
export function snapshotsEqual(a, b) {
    if (!a || !b || a.byteLength !== b.byteLength) return false;
    for (let i = 0; i < a.byteLength; i++) {
        if (i === SEQ_OFFSET || i === SEQ_OFFSET + 1) continue;
        if (a[i] !== b[i]) return false;
    }
    return true;
}

export function writeSnapshotSeq(bytes, seq) {
    bytes[SEQ_OFFSET] = (seq >> 8) & 0xff;
    bytes[SEQ_OFFSET + 1] = seq & 0xff;
}

/**
 * @param {ArrayBuffer|ArrayBufferView} data
 * @param {SnapshotView} view
 * @returns {boolean} false se a mensagem não for um snapshot válido
 */
export function decodeSnapshot(data, view) {
    const dv = data instanceof ArrayBuffer
        ? new DataView(data)
        : new DataView(data.buffer, data.byteOffset, data.byteLength);

    if (dv.byteLength < HEADER_BYTES) return false;
    if (dv.getUint8(0) !== MSG.SNAPSHOT) return false;
    if (dv.getUint8(1) !== PROTOCOL_VERSION) {
        console.warn(`[Protocol] Versão de snapshot incompatível: ${dv.getUint8(1)} (esperado ${PROTOCOL_VERSION})`);
        return false;
    }

    const count = dv.getUint16(18);
    if (count > view.capacity || dv.byteLength < HEADER_BYTES + count * CARD_BYTES) return false;

    view.seq = dv.getUint16(SEQ_OFFSET);
    view.phase = dv.getUint8(4);
    view.round = dv.getUint16(5);
    view.selfHP = dv.getInt16(7);
    view.oppHP = dv.getInt16(9);
    view.selfColor = dv.getUint8(11);
    view.flags = dv.getUint8(12);
    view.selfDiscards = dv.getUint8(13);
    view.oppDiscards = dv.getUint8(14);
    view.result = dv.getUint8(15);
    view.deckCount = dv.getUint16(16);
    view.cardCount = count;
    view.ackSeq = dv.getUint16(20);

    let offset = HEADER_BYTES;
    for (let i = 0; i < count; i++) {
        view.ids[i] = dv.getUint16(offset);
        view.zone[i] = dv.getUint8(offset + 2);
        view.order[i] = dv.getUint8(offset + 3);
        view.type[i] = dv.getUint8(offset + 4);
        view.color[i] = dv.getUint8(offset + 5);
        view.power[i] = dv.getInt8(offset + 6);
        offset += CARD_BYTES;
    }
    return true;
}
