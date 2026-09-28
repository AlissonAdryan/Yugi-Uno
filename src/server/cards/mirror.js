import { CONFIG } from '../../config/constants.js';
import { EVENT, MIRROR_RESULT } from '../../network/protocol.js';
import { SEAT } from '../../utils/zones.js';
import { reviveSave } from './revive.js';

const { TIMINGS } = CONFIG;
const SEATS = [SEAT.P1, SEAT.P2];

/**
 * Espelho Sombrio (GAME_RULES §6.13): no choque, copia o valor da carta inimiga + COPY_BONUS. Vence por
 * esse bônus (a inimiga se estilhaça) e sobrevive valendo exatamente COPY_BONUS. Contra números
 * (e consumíveis invocados, valor 0) ele sempre vence — o preço vem ao atingir a vida.
 * @param {import('../server-combat.js').ServerCombat} combat
 */
export async function resolveMirrorClash(combat, seat, mirrorId, targetId) {
    const s = combat.state;
    const copied = Math.max(0, s.power[targetId]);
    const bonus = CONFIG.MIRROR.COPY_BONUS;
    console.log(`[ServerCombat] Espelho de P${seat + 1} copiou ${copied} (+${bonus} = ${copied + bonus}) e estilhaçou a carta ${targetId}; fica com ${bonus}.`);
    combat.engine.emit(EVENT.MIRROR_CLASH, { mirrorId, targetId, seat, copied, result: MIRROR_RESULT.WIN });
    s.power[mirrorId] = bonus;
    combat.deck.discard(targetId);
    combat.engine.markDirty();
    await combat.engine.sleep(TIMINGS.MIRROR_CLASH);
}

/**
 * Paradoxo: Espelho x Espelho (um tenta copiar o outro) ou Espelho x Block (copia a "essência" do Block).
 * Os dois se estilhaçam.
 */
export async function resolveMirrorParadox(combat, a, b) {
    const s = combat.state;
    const { MIRROR } = CONFIG.CARD_TYPES;
    const mirrorId = s.type[a] === MIRROR ? a : b;
    const targetId = mirrorId === a ? b : a;
    const seat = mirrorId === a ? SEAT.P1 : SEAT.P2;
    console.log(`[ServerCombat] Paradoxo do Espelho (P${seat + 1}): ${mirrorId} e ${targetId} se estilhaçam.`);
    combat.engine.emit(EVENT.MIRROR_CLASH, { mirrorId, targetId, seat, copied: 0, result: MIRROR_RESULT.PARADOX });
    combat.deck.discard(a);
    combat.deck.discard(b);
    combat.engine.markDirty();
    await combat.engine.sleep(TIMINGS.MIRROR_CLASH);
}

/**
 * Espelho na vida: fere o alvo com o valor que carrega e, se o alvo sobreviver, o reflexo fere o próprio
 * dono com o mesmo dano (o Escudo e o Reviver de cada um valem normalmente). Sem valor copiado (nunca
 * chocou) não há o que refletir: ele só se desfaz. O Espelho não volta pra mão.
 * @param {import('../server-combat.js').ServerCombat} combat
 * @returns {Promise<number>} assento vencedor da partida se alguém morreu, senão -1
 */
export async function resolveMirrorDirectHit(combat, attacker, target, cardId) {
    const s = combat.state;
    const raw = Math.max(0, s.power[cardId]);
    // Calcula os dois golpes, emite e só então aplica (o snapshot nunca mostra a vida caindo antes da animação)
    const hit = combat.previewLifeHit(target, raw);
    // O reflexo só volta se o alvo ficou de pé (se ele morreu, a partida já acabou)
    const recoil = hit.damage > 0 && hit.hp > 0
        ? combat.previewLifeHit(attacker, hit.damage)
        : { damage: 0, absorbed: 0, revived: false, guarded: false, hp: s.hp[attacker] };

    console.log(`[ServerCombat] Espelho de P${attacker + 1} atingiu P${target + 1}: -${hit.damage} HP`
        + (recoil.damage > 0 ? `; o reflexo tirou -${recoil.damage} HP do próprio dono.` : raw === 0 ? ' (sem valor copiado: se desfez).' : '.'));

    for (const viewer of SEATS) {
        const data = {
            cardId, seat: attacker, damage: hit.damage, recoil: recoil.damage,
            guarded: hit.guarded ? 1 : 0, recoilGuarded: recoil.guarded ? 1 : 0
        };
        if (viewer === target && hit.absorbed > 0) data.absorbed = hit.absorbed;
        if (viewer === attacker && recoil.absorbed > 0) data.recoilAbsorbed = recoil.absorbed;
        combat.engine.emitTo(viewer, EVENT.MIRROR_HIT, data);
    }
    combat.applyLifeHit(attacker, target, hit);
    if (recoil.damage > 0) combat.applyLifeHit(-1, attacker, recoil);
    combat.deck.discard(cardId);
    combat.engine.markDirty();
    await combat.engine.sleep(TIMINGS.MIRROR_HIT);

    if (hit.revived) await reviveSave(combat, target);
    if (recoil.revived) await reviveSave(combat, attacker);
    if (s.hp[target] <= 0) return attacker;
    if (s.hp[attacker] <= 0) return target;
    return -1;
}
