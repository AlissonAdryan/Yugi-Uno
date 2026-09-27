import { CONFIG } from '../config/constants.js';

/**
 * Regras puras do jogo (sem DOM, sem rede, sem estado).
 * Usadas pelo servidor autoritativo, pela validação otimista do cliente, pela IA e pelo Worker.
 */

const { COLOR, CARD_TYPES } = CONFIG;

export const CLASH_KIND = Object.freeze({
    NUMBERS: 0,
    MUTUAL_DESTRUCTION: 1,
    A_BLOCKS: 2,
    B_BLOCKS: 3,
    A_REVERSES: 4,
    B_REVERSES: 5
});

/** Cartas sem cor vinculada (+4, Trocar Cor) podem ser jogadas em qualquer cor e não contam no sorteio. */
export function isColorless(color) {
    return color === COLOR.BLACK || color === COLOR.NONE;
}

/** Bit da cor para máscaras de "cores em comum" (0 para cartas sem cor). */
export function colorBit(color) {
    if (isColorless(color) || color === COLOR.RAINBOW) return 0;
    return 1 << color;
}

/**
 * @param {number} cardColor
 * @param {number} activeColor cor sorteada da rodada (ou RAINBOW)
 */
export function canPlayColor(cardColor, activeColor) {
    if (activeColor === COLOR.RAINBOW || activeColor === COLOR.NONE) return true;
    return isColorless(cardColor) || cardColor === activeColor;
}

/**
 * Qualquer estrutura SoA com a face das cartas: ServerState, CardPool ou SnapshotView.
 * @typedef {{ type: ArrayLike<number>, color: ArrayLike<number>, power: ArrayLike<number> }} FaceStore
 */

/**
 * Identidade da carta ignorando a cor: tudo que define a carta exceto a cor.
 * Único ponto a atualizar se uma carta futura ganhar novos atributos.
 * @param {FaceStore} store
 * @param {number} a índice da carta A no store
 * @param {number} b índice da carta B no store
 */
export function isSameCardIgnoringColor(store, a, b) {
    return store.type[a] === store.type[b] && store.power[a] === store.power[b];
}

/**
 * Espelho de Defesa (GAME_RULES §5): com uma carta colorida no Ataque,
 * a Defesa aceita a mesma carta em qualquer cor.
 * @param {FaceStore} store
 * @param {number} attackIdx carta no Slot de Ataque (-1 se vazio)
 * @param {number} cardIdx carta candidata à Defesa
 */
export function isMirrorDefense(store, attackIdx, cardIdx) {
    if (attackIdx < 0 || isColorless(store.color[attackIdx])) return false;
    return isSameCardIgnoringColor(store, attackIdx, cardIdx);
}

/**
 * Validação de cor para um slot de combate (Ataque: attackIdx = -1).
 * @param {FaceStore} store
 * @param {number} cardIdx
 * @param {number} activeColor cor ativa do jogador (sorteada ou RAINBOW)
 * @param {number} attackIdx carta no Ataque quando o alvo é a Defesa, senão -1
 */
export function canPlayOnCombatSlot(store, cardIdx, activeColor, attackIdx) {
    return canPlayColor(store.color[cardIdx], activeColor) || isMirrorDefense(store, attackIdx, cardIdx);
}

/**
 * Combo de cartas idênticas no mesmo slot.
 * Exige mesma cor, mesmo tipo e mesmo poder. Exceto +4 que não pode combar.
 */
export function isValidCombo(store, topIdx, cardIdx) {
    if (store.type[cardIdx] === CONFIG.CARD_TYPES.PLUS4) return false;
    return isSameCardIgnoringColor(store, topIdx, cardIdx) && store.color[topIdx] === store.color[cardIdx];
}

export function isSummon(type) {
    return type === CARD_TYPES.PLUS2 || type === CARD_TYPES.PLUS4;
}

export function summonCount(type) {
    if (type === CARD_TYPES.PLUS4) return 4;
    if (type === CARD_TYPES.PLUS2) return 2;
    return 0;
}

export function isConsumable(type) {
    return type === CARD_TYPES.CHANGE_COLOR;
}

/**
 * Choque numérico. Positivo: A vence e fica com esse valor. Negativo: B vence com o módulo. Zero: empate.
 * @returns {number}
 */
export function resolveNumberClash(powerA, powerB) {
    return powerA - powerB;
}

/**
 * Classifica o choque entre duas cartas de topo (nunca +2/+4, que explodem antes).
 * Trocar Cor que chegue ao combate via invocação se comporta como número de valor 0.
 */
export function classifyClash(typeA, typeB) {
    const aSpecial = typeA === CARD_TYPES.BLOCK || typeA === CARD_TYPES.REVERSE;
    const bSpecial = typeB === CARD_TYPES.BLOCK || typeB === CARD_TYPES.REVERSE;

    if (!aSpecial && !bSpecial) return CLASH_KIND.NUMBERS;
    if (aSpecial && bSpecial) return CLASH_KIND.MUTUAL_DESTRUCTION;
    if (aSpecial) return typeA === CARD_TYPES.BLOCK ? CLASH_KIND.A_BLOCKS : CLASH_KIND.A_REVERSES;
    return typeB === CARD_TYPES.BLOCK ? CLASH_KIND.B_BLOCKS : CLASH_KIND.B_REVERSES;
}

/** Quantas cores básicas estão presentes na máscara (ver colorBit). */
export function colorCount(mask) {
    const colors = CONFIG.BASIC_COLORS;
    let count = 0;
    for (let i = 0; i < colors.length; i++) {
        if (mask & (1 << colors[i])) count++;
    }
    return count;
}

/**
 * Sorteia uma cor entre as presentes na máscara.
 * @param {number} mask
 * @param {() => number} [random]
 * @returns {number} COLOR.* ou COLOR.NONE se a máscara estiver vazia
 */
export function pickColorFromMask(mask, random = Math.random) {
    const colors = CONFIG.BASIC_COLORS;
    let count = 0;
    for (let i = 0; i < colors.length; i++) {
        if (mask & (1 << colors[i])) count++;
    }
    if (count === 0) return COLOR.NONE;

    let pick = Math.floor(random() * count);
    for (let i = 0; i < colors.length; i++) {
        if (mask & (1 << colors[i])) {
            if (pick === 0) return colors[i];
            pick--;
        }
    }
    return COLOR.NONE;
}

/** Quantas cartas precisam ser doadas antes da compra para não estourar o limite da mão. */
export function handLimitExcess(handCount, incoming) {
    return Math.max(0, handCount + incoming - CONFIG.MAX_HAND_SIZE);
}

/**
 * @param {number} seat
 * @param {number} roundWinner assento vencedor da rodada, ou -1 em empate
 */
export function roundDrawsFor(seat, roundWinner) {
    if (roundWinner < 0) return CONFIG.ROUND_DRAWS.TIE;
    return seat === roundWinner ? CONFIG.ROUND_DRAWS.WINNER : CONFIG.ROUND_DRAWS.LOSER;
}
