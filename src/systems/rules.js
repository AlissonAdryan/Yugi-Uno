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
    return type === CARD_TYPES.CHANGE_COLOR || type === CARD_TYPES.HEAL
        || type === CARD_TYPES.SHIELD || type === CARD_TYPES.REVIVE
        || type === CARD_TYPES.PAINT;
}

/**
 * Por que este consumível não pode ser usado agora (null = pode). Única fonte da regra: o servidor
 * valida com ela, o cliente usa pra aceitar/recusar o arraste no slot USE e a IA pra decidir.
 * @param {number} type CARD_TYPES.*
 * @param {number} status bitmask CONFIG.STATUS do próprio jogador
 * @returns {string|null}
 */
export function consumableBlockReason(type, status) {
    const { STATUS } = CONFIG;
    switch (type) {
        case CARD_TYPES.HEAL: return (status & STATUS.HEAL) ? 'HEAL_ALREADY_ACTIVE' : null;
        case CARD_TYPES.SHIELD: return (status & STATUS.SHIELD) ? 'SHIELD_ALREADY_ACTIVE' : null;
        case CARD_TYPES.REVIVE: return (status & STATUS.REVIVE_USED) ? 'REVIVE_ALREADY_USED' : null;
        default: return null;
    }
}

/**
 * Dano que um golpe direto realmente tira, com o Escudo (metade, arredondada pra baixo) aplicado.
 * @param {number} rawDamage
 * @param {boolean} shielded
 */
export function shieldedDamage(rawDamage, shielded) {
    return shielded ? Math.floor(rawDamage * CONFIG.CONSUMABLES.SHIELD_DAMAGE_RATIO) : rawDamage;
}

// --- Economia (lixeira, moedas e loja) ---------------------------------------

const TYPE_NAMES = Object.freeze(Object.fromEntries(Object.entries(CARD_TYPES).map(([k, v]) => [v, k])));

/** Nome do tipo em CARD_TYPES (chave do catálogo e das traduções CARD_*), ou '' se desconhecido. */
export function cardTypeName(type) {
    return TYPE_NAMES[type] || '';
}

/** @returns {object|null} entrada de CONFIG.CARD_CATALOG */
export function catalogEntry(type) {
    return CONFIG.CARD_CATALOG[TYPE_NAMES[type]] || null;
}

export function hasCardTag(type, tag) {
    const entry = catalogEntry(type);
    return !!entry && (entry.tags & tag) !== 0;
}

/**
 * Moedas que a carta rende na lixeira. Números valem o valor atual; especiais, o do catálogo.
 * Carta comprada na loja (CARD_FLAGS.RESALE) revende por uma fração — sem isso, comprar um 9 por 8
 * e revendê-lo por 9 viraria dinheiro infinito.
 * @returns {number} 0 se não puder ser vendida
 */
export function sellValue(type, power, cardFlags = 0) {
    const entry = catalogEntry(type);
    if (!entry || (entry.tags & CONFIG.CARD_TAGS.SELLABLE) === 0) return 0;
    const base = entry.sell === 'POWER' ? Math.max(0, power) : entry.sell;
    if (cardFlags & CONFIG.CARD_FLAGS.RESALE) return Math.floor(base * CONFIG.SHOP.RESALE_RATIO);
    return base;
}

/**
 * Por que a compra do item não pode acontecer (null = pode). Mesma regra no servidor e no cliente.
 * @param {{ price: number, flags: number, type: number }} item
 */
export function purchaseBlockReason(item, coins, handSize) {
    if (item.type === CARD_TYPES.HIDDEN || (item.flags & CONFIG.SHOP_ITEM_FLAGS.SOLD)) return 'ITEM_UNAVAILABLE';
    if (coins < item.price) return 'NOT_ENOUGH_COINS';
    if (handSize >= CONFIG.MAX_HAND_SIZE) return 'HAND_FULL';
    return null;
}

/** Moedas do fim da rodada: quem perdeu ganha mais (o oposto das compras de carta). */
export function roundCoinsFor(seat, roundWinner) {
    const { ROUND_COINS } = CONFIG.SHOP;
    if (roundWinner < 0) return ROUND_COINS.TIE;
    return seat === roundWinner ? ROUND_COINS.WINNER : ROUND_COINS.LOSER;
}

/** Sorteio ponderado de uma lista [valor, peso]. */
export function weightedPick(pairs, random = Math.random) {
    let total = 0;
    for (let i = 0; i < pairs.length; i++) total += pairs[i][1];
    let roll = random() * total;
    for (let i = 0; i < pairs.length; i++) {
        roll -= pairs[i][1];
        if (roll < 0) return pairs[i][0];
    }
    return pairs[pairs.length - 1][0];
}

/** Cura do fim do combate: metade do dano causado na rodada (pra baixo), limitada à vida máxima. */
export function healAmount(damageDealt, currentHp) {
    const heal = Math.floor(damageDealt * CONFIG.CONSUMABLES.HEAL_RATIO);
    return Math.max(0, Math.min(heal, CONFIG.MAX_HP - currentHp));
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
 * Consumíveis (Trocar Cor, Cura, Escudo, Reviver) que cheguem ao combate via invocação se comportam
 * como número de valor 0 — o efeito deles só existe quando usados no slot USE.
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
