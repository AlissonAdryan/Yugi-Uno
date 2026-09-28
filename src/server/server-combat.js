import { CONFIG } from '../config/constants.js';
import {
    CLASH_KIND, classifyClash, healAmount, isConsumable, isSummon, resolveNumberClash, shieldedDamage, summonCount
} from '../systems/rules.js';
import { SEAT, ZONE, ZONE_OFFSET, seatZone } from '../utils/zones.js';
import { EVENT, HIT_EFFECT } from '../network/protocol.js';

const { CARD_TYPES, TIMINGS } = CONFIG;
const { ATTACK, DEFENSE, HAND, USE } = ZONE_OFFSET;
const SEATS = [SEAT.P1, SEAT.P2];

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
        // Dano numérico que cada assento causou na rodada (base da Cura)
        this.damageDealt = new Int16Array(2);
    }

    /**
     * @returns {Promise<{ roundWinner: number, gameWinner: number }>}
     */
    async resolve() {
        const s = this.state;
        this.roundWinner = -1;
        this.gameWinner = -1;
        this.damageTaken.fill(0);
        this.damageDealt.fill(0);

        // A Troca de Guarda age antes de qualquer revelação: quem entra em combate já é a pilha trocada
        await this.resolveGuardSwap();
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

        if (!this.engine.isGameOver() && this.gameWinner < 0) {
            await this.applyHeals();
            this.returnLeftovers();
        }
        return { roundWinner: this.roundWinner, gameWinner: this.gameWinner };
    }

    faceOf(id) {
        const s = this.state;
        return { id, type: s.type[id], color: s.color[id], power: s.power[id] };
    }

    /**
     * Troca de Guarda (GAME_RULES §6.11): em cada campo que tiver Ataque E Defesa, as duas pilhas
     * trocam de lugar inteiras (a ordem do combo é preservada). Duas Trocas (uma de cada jogador) se
     * anulam. Um lado sem Defesa não tem o que trocar e fica como está.
     */
    async resolveGuardSwap() {
        const s = this.state;
        const users = s.guardSwap[SEAT.P1] + s.guardSwap[SEAT.P2];
        if (users === 0) return;
        s.guardSwap.fill(0);

        const cancelled = users % 2 === 0;
        const swaps = [0, 0];
        if (!cancelled) {
            for (const seat of SEATS) {
                if (s.zone(seat, ATTACK).length > 0 && s.zone(seat, DEFENSE).length > 0) swaps[seat] = 1;
            }
        }
        console.log(cancelled
            ? '[ServerCombat] Duas Trocas de Guarda se anularam: ninguém troca.'
            : `[ServerCombat] Troca de Guarda! Campos trocando: P1=${swaps[0]} P2=${swaps[1]}.`);

        // Quem usou a carta continua secreto: cada um recebe só "o meu lado troca / o do oponente troca"
        for (const viewer of SEATS) {
            this.engine.emitTo(viewer, EVENT.GUARD_SWAP, {
                self: swaps[viewer], opp: swaps[1 - viewer], cancelled: cancelled ? 1 : 0
            });
        }
        for (const seat of SEATS) {
            if (!swaps[seat]) continue;
            const attack = s.zone(seat, ATTACK).slice();
            const defense = s.zone(seat, DEFENSE).slice();
            for (const id of defense) s.moveCard(id, seatZone(seat, ATTACK));
            for (const id of attack) s.moveCard(id, seatZone(seat, DEFENSE));
        }
        this.engine.markDirty();
        await this.engine.sleep(TIMINGS.GUARD_SWAP);
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
            case CLASH_KIND.A_LIGHTNING:
                await this.lightning(SEAT.P1, a);
                return;
            case CLASH_KIND.B_LIGHTNING:
                await this.lightning(SEAT.P2, b);
                return;
        }
    }

    /**
     * Relâmpago em Cadeia (GAME_RULES §6.10): fulmina a carta da frente do inimigo e salta pra próxima —
     * a seguinte da mesma pilha (combo) ou, sem ela, a do topo da Defesa inimiga. O Relâmpago se
     * descarrega junto (é destruído). Age antes do Block, então um Block na frente só é fulminado.
     */
    async lightning(seat, lightningId) {
        const s = this.state;
        const enemy = 1 - seat;
        const front = s.zone(enemy, ATTACK);
        const targets = [];
        // Do topo pra base na pilha da frente; depois o topo da Defesa
        for (let i = front.length - 1; i >= 0 && targets.length < CONFIG.LIGHTNING.CHAIN_TARGETS; i--) targets.push(front[i]);
        const defense = s.zone(enemy, DEFENSE);
        if (targets.length < CONFIG.LIGHTNING.CHAIN_TARGETS && defense.length > 0) targets.push(defense[defense.length - 1]);

        console.log(`[ServerCombat] Relâmpago de P${seat + 1} fulminou ${targets.length} carta(s) de P${enemy + 1}: ${targets.join(', ')}.`);
        this.engine.emit(EVENT.LIGHTNING_STRIKE, { lightningId, seat, targets: targets.map((id) => this.faceOf(id)) });
        this.deck.discard(lightningId);
        for (const id of targets) this.deck.discard(id);
        this.engine.markDirty();
        await this.engine.sleep(TIMINGS.LIGHTNING);
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

            let revived = false;
            let extraWait = 0;
            if (type === CARD_TYPES.LIGHTNING) {
                const burned = this.pickHandBurn(target);
                console.log(`[ServerCombat] Relâmpago atingiu P${target + 1}: Sobrecarga queimou ${burned.length} carta(s) da mão.`);
                this.engine.emit(EVENT.DIRECT_HIT, { cardId, seat: attacker, damage: 0, effect: HIT_EFFECT.OVERLOAD, burned });
                this.deck.discard(cardId);
                for (const id of burned) this.deck.discard(id);
                extraWait = TIMINGS.OVERLOAD_EXTRA;
            } else if (type === CARD_TYPES.BLOCK) {
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
                revived = this.numericHit(attacker, target, cardId);
            }

            this.engine.markDirty();
            await this.engine.sleep(TIMINGS.DIRECT_HIT + extraWait);
            if (revived) await this.reviveSave(target);

            if (s.hp[target] <= 0) {
                this.gameWinner = attacker;
                return;
            }
        }
    }

    /**
     * Golpe numérico na vida, com os consumíveis do alvo aplicados na ordem: Escudo (metade do dano)
     * -> Reviver (um golpe que mataria deixa a vida em 1; depois de salvar, todo golpe da mesma
     * rodada também para em 1). A carta volta para a mão do atacante.
     * @returns {boolean} true se o Reviver acabou de salvar o alvo neste golpe
     */
    numericHit(attacker, target, cardId) {
        const s = this.state;
        const raw = Math.max(0, s.power[cardId]);
        const damage = shieldedDamage(raw, s.shieldActive[target] === 1);
        const absorbed = raw - damage;

        let hp = s.hp[target] - damage;
        let revived = false;
        let guarded = false;
        if (hp <= 0 && damage > 0) {
            if (s.reviveGuard[target]) {
                hp = CONFIG.CONSUMABLES.REVIVE_SURVIVE_HP;
                guarded = true;
            } else if (s.reviveRounds[target] > 0) {
                hp = CONFIG.CONSUMABLES.REVIVE_SURVIVE_HP;
                revived = true;
            }
        }

        console.log(`[ServerCombat] Dano direto de P${attacker + 1}: -${damage} HP em P${target + 1}`
            + (absorbed > 0 ? ` (Escudo segurou ${absorbed})` : '')
            + (revived ? ' -> REVIVER salvou da morte!' : guarded ? ' -> Reviver segurou a vida em 1' : ''));

        const payload = { cardId, seat: attacker, damage, effect: HIT_EFFECT.NONE, guarded: guarded ? 1 : 0 };
        this.engine.emitTo(attacker, EVENT.DIRECT_HIT, payload);
        this.engine.emitTo(target, EVENT.DIRECT_HIT, absorbed > 0 ? Object.assign({ absorbed }, payload) : payload);

        s.hp[target] = Math.max(0, hp);
        this.damageTaken[target] += damage;
        this.damageDealt[attacker] += damage;
        if (revived) {
            s.reviveRounds[target] = 0;
            s.reviveGuard[target] = 1;
        }
        s.moveCard(cardId, seatZone(attacker, HAND));
        return revived;
    }

    /** O Reviver se revela para os dois: luz divina na vida do alvo e a carta se despedaça no centro. */
    async reviveSave(target) {
        console.log(`[ServerCombat] Reviver de P${target + 1} ativado: vida travada em ${CONFIG.CONSUMABLES.REVIVE_SURVIVE_HP} pelo resto da rodada.`);
        this.engine.emit(EVENT.REVIVE_TRIGGERED, { seat: target });
        this.engine.markDirty();
        await this.engine.sleep(TIMINGS.REVIVE_SAVE);
    }

    /**
     * Fim do combate: quem usou Cura recupera metade do dano que causou (pra baixo, até a vida máxima).
     * Sem dano causado (ou vida cheia) a carta foi desperdiçada — só quem usou fica sabendo.
     */
    async applyHeals() {
        const s = this.state;
        for (const seat of SEATS) {
            if (!s.healActive[seat]) continue;
            s.healActive[seat] = 0;
            const amount = healAmount(this.damageDealt[seat], s.hp[seat]);

            if (amount <= 0) {
                console.log(`[ServerCombat] Cura de P${seat + 1} desperdiçada (dano causado: ${this.damageDealt[seat]}, vida: ${s.hp[seat]}).`);
                this.engine.markDirty();
                this.engine.emitTo(seat, EVENT.HEAL, { seat, amount: 0 });
                continue;
            }

            console.log(`[ServerCombat] Cura de P${seat + 1}: +${amount} HP (dano causado: ${this.damageDealt[seat]}).`);
            this.engine.emit(EVENT.HEAL, { seat, amount });
            s.hp[seat] += amount;
            this.engine.markDirty();
            await this.engine.sleep(TIMINGS.HEAL);
        }
    }

    /** Sobrecarga: sorteia até HAND_BURN cartas diferentes da mão do alvo (sem alterar a mão ainda). */
    pickHandBurn(target) {
        const hand = this.state.zone(target, HAND).slice();
        const count = Math.min(CONFIG.LIGHTNING.HAND_BURN, hand.length);
        for (let i = 0; i < count; i++) {
            const j = i + Math.floor(Math.random() * (hand.length - i));
            const tmp = hand[i];
            hand[i] = hand[j];
            hand[j] = tmp;
        }
        return hand.slice(0, count);
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
