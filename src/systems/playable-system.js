import { CONFIG } from '../config/constants.js';
import { canPlayOnCombatSlot, consumableBlockReason, isConsumable, isValidCombo } from './rules.js';
import { ZONE } from '../utils/zones.js';

/**
 * PlayableSystem - responde "esta carta da mão pode ir para este slot agora?" na visão do jogador local
 * (slots livres, bloqueio de defesa, cor da rodada, Espelho de Defesa) e marca pool.outlined para o contorno animado.
 * Só visual/otimista: o servidor continua validando tudo.
 */
export class PlayableSystem {
    /**
     * @param {import('../entities/card-pool.js').CardPool} pool
     * @param {import('./layout-system.js').LayoutSystem} layout pilhas visuais (já incluem previsões locais)
     * @param {import('./board-system.js').BoardSystem} board
     */
    constructor(pool, layout, board) {
        this.pool = pool;
        this.layout = layout;
        this.board = board;

        this.excludedTypes = new Uint8Array(256);
        for (const type of CONFIG.PLAYABLE_OUTLINE.EXCLUDED_TYPES) this.excludedTypes[type] = 1;
        // Status próprio (CONFIG.STATUS) do último snapshot: Cura/Escudo já ativos, Reviver já usado
        this.status = 0;
    }

    /** Regras de slot (sem cor): tipo de carta compatível, slot livre e defesa não bloqueada. */
    slotAccepts(id, zone) {
        const type = this.pool.type[id];
        if (zone === ZONE.SELF_USE) {
            return isConsumable(type) && this.layout.stack(ZONE.SELF_USE).length === 0
                && consumableBlockReason(type, this.status) === null;
        }
        if (zone !== ZONE.SELF_ATTACK && zone !== ZONE.SELF_DEFENSE) return false;
        if (isConsumable(type)) return false;
        
        const stack = this.layout.stack(zone);
        if (stack.length > 0) {
            if (stack.length >= CONFIG.COMBO_MAX_STACK) return false;
            if (!isValidCombo(this.pool, stack[0], id)) return false;
        }
        
        if (zone === ZONE.SELF_DEFENSE && this.board.locked[ZONE.SELF_DEFENSE] && stack.length === 0) return false;
        return true;
    }

    /** Regras de cor do slot (inclui o Espelho de Defesa). O slot USE não tem restrição de cor. */
    colorAllows(id, zone, activeColor) {
        if (zone === ZONE.SELF_USE) return true;
        
        const stack = this.layout.stack(zone);
        if (stack.length > 0) return true; // Se tem combo, slotAccepts já validou a cor/tipo

        let attackId = -1;
        if (zone === ZONE.SELF_DEFENSE) {
            const attack = this.layout.stack(ZONE.SELF_ATTACK);
            if (attack.length > 0) attackId = attack[attack.length - 1];
        }
        return canPlayOnCombatSlot(this.pool, id, activeColor, attackId);
    }

    canPlayOn(id, zone, activeColor) {
        return this.slotAccepts(id, zone) && this.colorAllows(id, zone, activeColor);
    }

    /**
     * Recalcula o contorno das cartas da mão. Chamar após layout.rebuild().
     * @param {boolean} canPrepare jogador local está na preparação e ainda não finalizou
     * @param {number} activeColor cor ativa do jogador local
     * @param {number} [status] bitmask CONFIG.STATUS do jogador local
     */
    update(canPrepare, activeColor, status = 0) {
        this.status = status;
        const pool = this.pool;
        pool.outlined.fill(0);
        if (!canPrepare) return;

        const hand = this.layout.stack(ZONE.SELF_HAND);
        for (let i = 0; i < hand.length; i++) {
            const id = hand[i];
            if (this.excludedTypes[pool.type[id]] === 1) continue;
            if (this.canPlayOn(id, ZONE.SELF_ATTACK, activeColor)
                || this.canPlayOn(id, ZONE.SELF_DEFENSE, activeColor)
                || this.canPlayOn(id, ZONE.SELF_USE, activeColor)) {
                pool.outlined[id] = 1;
            }
        }
    }
}
