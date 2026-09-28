import { CONFIG } from '../../config/constants.js';
import { EVENT, HIT_EFFECT } from '../../network/protocol.js';
import { ZONE_OFFSET } from '../../utils/zones.js';

const { ATTACK } = ZONE_OFFSET;
const { TIMINGS } = CONFIG;

/**
 * Block se sacrifica e anula a pilha inteira do oponente naquele slot.
 */
export async function resolveBlockClash(combat, seat, blockId) {
    const victims = combat.state.zone(1 - seat, ATTACK).slice();
    console.log(`[ServerCombat] Block de P${seat + 1} anulou ${victims.length} carta(s).`);
    combat.engine.emit(EVENT.BLOCK_SMASH, { blockId, victimIds: victims });
    
    combat.deck.discard(blockId);
    for (const id of victims) combat.deck.discard(id);
    
    combat.engine.markDirty();
    await combat.engine.sleep(TIMINGS.BLOCK_SMASH);
}

/**
 * Atinge a vida e ativa o Efeito Lockout.
 */
export async function resolveBlockDirectHit(combat, attacker, target, cardId) {
    console.log(`[ServerCombat] Block atingiu P${target + 1}: defesa bloqueada na próxima rodada.`);
    combat.engine.emit(EVENT.DIRECT_HIT, { cardId, seat: attacker, damage: 0, effect: HIT_EFFECT.LOCKOUT });
    
    combat.state.defenseLock[target] = 1;
    combat.deck.discard(cardId);
    
    return 0; // Sem wait extra
}
