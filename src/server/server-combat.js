import { CONFIG } from '../config/constants.js';
import {
    CLASH_KIND, classifyClash, isConsumable, isSummon, resolveNumberClash, summonCount
} from '../systems/rules.js';
import { SEAT, ZONE, ZONE_OFFSET, seatZone } from '../utils/zones.js';
import { EVENT, HIT_EFFECT } from '../network/protocol.js';

const { CARD_TYPES, TIMINGS } = CONFIG;
const { ATTACK, DEFENSE, HAND, USE } = ZONE_OFFSET;

/**
 * ServerCombat - resolução autoritativa do combate (GAME_RULES.md §3 e §6).
 * Cada passo segue o padrão: emit(evento) -> mutação -> sleep(tempo da animação).
 */
export class ServerCombat {
    /**
     * @param {import('./server-state.js').ServerState} state
     * @param {import('../systems/deck-system.js').DeckSystem} deck
     * @param {import('./server-engine.js').ServerEngine} engine
     */
    constructor(state, deck, engine) {
        this.state = state;
        this.deck = deck;
        this.engine = engine;
        this.roundWinner = -1;
        this.gameWinner = -1;
        // Dano numérico (-X ♥) que cada assento levou na rodada; Block/Reverso na vida não contam
        this.damageTaken = new Int16Array(2);
    }

    /**
     * @returns {Promise<{ roundWinner: number, gameWinner: number }>}
     */
    async resolve() {
        const s = this.state;
        this.roundWinner = -1;
        this.gameWinner = -1;
        this.damageTaken.fill(0);

        await this.revealCards([...s.zone(SEAT.P1, ATTACK), ...s.zone(SEAT.P2, ATTACK)], TIMINGS.REVEAL);

        let steps = 0;
        while (steps++ < CONFIG.COMBAT_MAX_STEPS && !this.engine.isGameOver() && this.gameWinner < 0) {
            const top0 = s.top(SEAT.P1, ATTACK);
            const top1 = s.top(SEAT.P2, ATTACK);

            if (top0 >= 0 && isSummon(s.type[top0])) { await this.summon(SEAT.P1, top0); continue; }
            if (top1 >= 0 && isSummon(s.type[top1])) { await this.summon(SEAT.P2, top1); continue; }

            if (top0 < 0 && top1 < 0) {
                const has0 = s.zone(SEAT.P1, DEFENSE).length > 0;
                const has1 = s.zone(SEAT.P2, DEFENSE).length > 0;
                if (!has0 && !has1) break;
                console.log('[ServerCombat] Empate na linha de frente. Revelando defesas...');
                // Os 1,5s da regra contam a partir do empate, cuja pausa (TIMINGS.TIE) já passou
                await this.engine.sleep(Math.max(0, TIMINGS.TIE_DEFENSE_DELAY - TIMINGS.TIE));
                await this.promoteDefenses(has0, has1);
                continue;
            }

            if (top0 < 0 || top1 < 0) {
                const defender = top0 < 0 ? SEAT.P1 : SEAT.P2;
                if (s.zone(defender, DEFENSE).length > 0) {
                    await this.promoteDefenses(defender === SEAT.P1, defender === SEAT.P2);
                    continue;
                }
                await this.assaultLife(1 - defender);
                break;
            }

            await this.clash(top0, top1);
        }

        if (steps >= CONFIG.COMBAT_MAX_STEPS) {
            console.warn('[ServerCombat] Limite de passos de combate atingido. Encerrando combate por segurança.');
        }

        if (!this.engine.isGameOver() && this.gameWinner < 0) this.returnLeftovers();
        return { roundWinner: this.roundWinner, gameWinner: this.gameWinner };
    }

    faceOf(id) {
        const s = this.state;
        return { id, type: s.type[id], color: s.color[id], power: s.power[id] };
    }

    async revealCards(ids, waitMs) {
        const s = this.state;
        const faces = [];
        for (const id of ids) {
            if (!s.revealed[id]) faces.push(this.faceOf(id));
        }
        if (faces.length > 0) {
            this.engine.emit(EVENT.REVEAL, { cards: faces });
            for (const face of faces) s.revealed[face.id] = 1;
            this.engine.markDirty();
        }
        await this.engine.sleep(waitMs);
    }

    /** Defesa entra na linha de frente (revelada), preservando a ordem da pilha. */
    async promoteDefenses(p1, p2) {
        const s = this.state;
        const ids = [];
        if (p1) ids.push(...s.zone(SEAT.P1, DEFENSE));
        if (p2) ids.push(...s.zone(SEAT.P2, DEFENSE));

        const faces = [];
        for (const id of ids) if (!s.revealed[id]) faces.push(this.faceOf(id));
        if (faces.length > 0) this.engine.emit(EVENT.REVEAL, { cards: faces });

        for (const id of ids) s.revealed[id] = 1;
        if (p1) s.moveAll(seatZone(SEAT.P1, DEFENSE), seatZone(SEAT.P1, ATTACK));
        if (p2) s.moveAll(seatZone(SEAT.P2, DEFENSE), seatZone(SEAT.P2, ATTACK));
        console.log(`[ServerCombat] Defesa promovida: ${p1 ? 'P1 ' : ''}${p2 ? 'P2' : ''}`);
        this.engine.markDirty();
        await this.engine.sleep(TIMINGS.PROMOTE);
    }

    /** +2/+4 explodem e puxam cartas públicas do baralho para o mesmo slot. */
    async summon(seat, cardId) {
        const s = this.state;
        const count = summonCount(s.type[cardId]);
        console.log(`[ServerCombat] P${seat + 1} ativou +${count}!`);
        this.engine.emit(EVENT.SUMMON, { cardId, seat, count });

        this.deck.discard(cardId);
        const zone = seatZone(seat, ATTACK);
        const drawn = [];
        for (let i = 0; i < count; i++) {
            const id = this.deck.draw(zone);
            if (id < 0) break;
            s.revealed[id] = 1;
            drawn.push(id);
        }
        this.sinkConsumablesToBack(zone, drawn);
        this.engine.markDirty();
        await this.engine.sleep(TIMINGS.SUMMON_BASE + count * TIMINGS.SUMMON_PER_CARD);
    }

    /**
     * Consumíveis puxados por +2/+4 não têm força pra lutar (GAME_RULES §6.1) e nunca devem ser
     * as primeiras a entrar em combate: empurra-as para o fundo da pilha recém-puxada (últimas a
     * atacar dentro deste puxão), preservando a ordem relativa entre elas e entre as demais.
     * Só reordena o array do servidor antes do snapshot sair — o cliente nunca vê a ordem "errada".
     */
    sinkConsumablesToBack(zone, drawnIds) {
        if (drawnIds.length < 2) return;
        const s = this.state;
        const consumables = drawnIds.filter((id) => isConsumable(s.type[id]));
        if (consumables.length === 0 || consumables.length === drawnIds.length) return;

        const others = drawnIds.filter((id) => !isConsumable(s.type[id]));
        const arr = s.zones[zone];
        // `drawnIds` são exatamente os últimos elementos empurrados neste puxão (nada mais escreveu
        // nessa zona no meio do loop síncrono acima) — dá pra reescrever só esse trecho do array.
        arr.splice(arr.length - drawnIds.length, drawnIds.length, ...consumables, ...others);
    }

    async clash(a, b) {
        const s = this.state;
        switch (classifyClash(s.type[a], s.type[b])) {
            case CLASH_KIND.NUMBERS: {
                const diff = resolveNumberClash(s.power[a], s.power[b]);
                if (diff === 0) {
                    await this.mutualDestruction(a, b);
                    return;
                }
                const winner = diff > 0 ? a : b;
                const loser = diff > 0 ? b : a;
                const winnerPower = Math.abs(diff);
                console.log(`[ServerCombat] Choque: ${s.power[a]} x ${s.power[b]} -> vencedora fica com ${winnerPower}`);
                this.engine.emit(EVENT.CLASH, { winnerId: winner, loserId: loser, winnerPower });
                s.power[winner] = winnerPower;
                this.deck.discard(loser);
                this.engine.markDirty();
                await this.engine.sleep(TIMINGS.CLASH);
                return;
            }
            case CLASH_KIND.MUTUAL_DESTRUCTION:
                await this.mutualDestruction(a, b);
                return;
            case CLASH_KIND.A_BLOCKS:
                await this.blockSmash(SEAT.P1, a);
                return;
            case CLASH_KIND.B_BLOCKS:
                await this.blockSmash(SEAT.P2, b);
                return;
            case CLASH_KIND.A_REVERSES:
                await this.reverse(SEAT.P1, a);
                return;
            case CLASH_KIND.B_REVERSES:
                await this.reverse(SEAT.P2, b);
                return;
        }
    }

    async mutualDestruction(a, b) {
        console.log('[ServerCombat] Empate/anulação: ambas destruídas.');
        this.engine.emit(EVENT.TIE, { cardIds: [a, b] });
        this.deck.discard(a);
        this.deck.discard(b);
        this.engine.markDirty();
        await this.engine.sleep(TIMINGS.TIE);
    }

    /** Block se sacrifica e anula a pilha inteira do oponente naquele slot. */
    async blockSmash(seat, blockId) {
        const victims = this.state.zone(1 - seat, ATTACK).slice();
        console.log(`[ServerCombat] Block de P${seat + 1} anulou ${victims.length} carta(s).`);
        this.engine.emit(EVENT.BLOCK_SMASH, { blockId, victimIds: victims });
        this.deck.discard(blockId);
        for (const id of victims) this.deck.discard(id);
        this.engine.markDirty();
        await this.engine.sleep(TIMINGS.BLOCK_SMASH);
    }

    /**
     * Reverso sozinho: rouba a pilha inimiga e deixa uma carta 1 de compensação.
     * Reverso vindo de uma pilha: troca as duas pilhas de lado.
     */
    async reverse(seat, reverseId) {
        const s = this.state;
        const ownZone = seatZone(seat, ATTACK);
        const oppZone = seatZone(1 - seat, ATTACK);
        const isAlone = s.zones[ownZone].length === 1;

        if (isAlone) {
            console.log(`[ServerCombat] Reverso de P${seat + 1} roubou a pilha inimiga.`);
            this.engine.emit(EVENT.REVERSE_STEAL, { reverseId, seat });
            this.deck.discard(reverseId);
            s.moveAll(oppZone, ownZone);

            const comp = this.deck.draw(oppZone);
            if (comp >= 0) {
                s.type[comp] = CARD_TYPES.NUMBER;
                s.color[comp] = this.deck.randomBasicColor();
                s.power[comp] = CONFIG.REVERSE_COMPENSATION_POWER;
                s.revealed[comp] = 1;
            }
        } else {
            console.log(`[ServerCombat] Reverso de P${seat + 1} inverteu as pilhas.`);
            this.engine.emit(EVENT.REVERSE_SWAP, { reverseId, seat });
            this.deck.discard(reverseId);
            const mine = s.zones[ownZone].slice();
            const theirs = s.zones[oppZone].slice();
            for (const id of mine) s.moveCard(id, oppZone);
            for (const id of theirs) s.moveCard(id, ownZone);
        }
        this.engine.markDirty();
        await this.engine.sleep(TIMINGS.REVERSE);
    }

    /** A pilha sobrevivente ataca a vida do oponente em série; cartas numéricas voltam para a mão. */
    async assaultLife(attacker) {
        const s = this.state;
        const target = 1 - attacker;
        const front = s.zone(attacker, ATTACK);
        this.roundWinner = attacker;

        while (front.length > 0 && !this.engine.isGameOver()) {
            const cardId = front[front.length - 1];
            const type = s.type[cardId];

            if (isSummon(type)) {
                await this.summon(attacker, cardId);
                continue;
            }

            if (type === CARD_TYPES.BLOCK) {
                console.log(`[ServerCombat] Block atingiu P${target + 1}: defesa bloqueada na próxima rodada.`);
                this.engine.emit(EVENT.DIRECT_HIT, { cardId, seat: attacker, damage: 0, effect: HIT_EFFECT.LOCKOUT });
                s.defenseLock[target] = 1;
                this.deck.discard(cardId);
            } else if (type === CARD_TYPES.REVERSE) {
                console.log('[ServerCombat] Reverso atingiu a vida: mãos trocadas!');
                this.engine.emit(EVENT.DIRECT_HIT, { cardId, seat: attacker, damage: 0, effect: HIT_EFFECT.HAND_SWAP });
                this.deck.discard(cardId);
                this.swapHands();
            } else {
                const damage = Math.max(0, s.power[cardId]);
                console.log(`[ServerCombat] Dano direto de P${attacker + 1}: -${damage} HP em P${target + 1}`);
                this.engine.emit(EVENT.DIRECT_HIT, { cardId, seat: attacker, damage, effect: HIT_EFFECT.NONE });
                s.hp[target] = Math.max(0, s.hp[target] - damage);
                this.damageTaken[target] += damage;
                s.moveCard(cardId, seatZone(attacker, HAND));
            }

            this.engine.markDirty();
            await this.engine.sleep(TIMINGS.DIRECT_HIT);

            if (s.hp[target] <= 0) {
                this.gameWinner = attacker;
                return;
            }
        }
    }

    swapHands() {
        const s = this.state;
        const hand0 = s.zone(SEAT.P1, HAND).slice();
        const hand1 = s.zone(SEAT.P2, HAND).slice();
        for (const id of hand0) s.moveCard(id, seatZone(SEAT.P2, HAND));
        for (const id of hand1) s.moveCard(id, seatZone(SEAT.P1, HAND));
    }

    /** Defesas intactas voltam para a mão sem nunca terem sido reveladas. */
    returnLeftovers() {
        const s = this.state;
        for (const seat of [SEAT.P1, SEAT.P2]) {
            const hand = seatZone(seat, HAND);
            s.moveAll(seatZone(seat, DEFENSE), hand);
            s.moveAll(seatZone(seat, ATTACK), hand);
            s.moveAll(seatZone(seat, USE), ZONE.DISCARD);
        }
        this.engine.markDirty();
    }
}
