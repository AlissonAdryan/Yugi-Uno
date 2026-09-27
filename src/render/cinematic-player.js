import { CONFIG } from '../config/constants.js';
import { Easing } from './animator.js';
import { PARTICLE_TYPES } from './particle-system.js';
import { EVENT, GAME_RESULT, HIT_EFFECT, REL_SEAT } from '../network/protocol.js';
import { SFX } from '../config/sound-presets.js';
import { ZONE, zoneSeat } from '../utils/zones.js';

const { ANIM, CARD_DIMENSIONS, COLOR } = CONFIG;
const HALF_W = CARD_DIMENSIONS.WIDTH / 2;
const HALF_H = CARD_DIMENSIONS.HEIGHT / 2;
const FIREWORK_COLORS = ['#2ecc71', '#f1c40f', '#3498db', '#9b59b6'];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * CinematicPlayer - traduz eventos do servidor em animações. Não altera regras, só a visão local.
 * Toda animação resolve (no máximo) no tempo previsto: a fila do GameClient nunca trava.
 */
export class CinematicPlayer {
    /**
     * @param {{ pool: import('../entities/card-pool.js').CardPool, animator: import('./animator.js').Animator,
     *           particles: import('./particle-system.js').ParticleSystem, hud: import('../ui/hud.js').Hud,
     *           audio: import('../audio/audio-engine.js').AudioEngine }} deps
     */
    constructor({ pool, animator, particles, hud, board, viewport, audio }) {
        this.pool = pool;
        this.board = board;
        this.viewport = viewport;
        this.animator = animator;
        this.particles = particles;
        this.hud = hud;
        this.audio = audio;
        this.gameOverShown = false;
        this.fireworksTimer = null;
    }

    /**
     * Toca o evento com animação.
     * @returns {Promise<void>}
     */
    async play(evt) {
        switch (evt.t) {
            case EVENT.COLOR_CHOSEN: this.audio.play(SFX.COLOR_CHANGE); this.hud.showColorAlert(evt.color); return;
            case EVENT.RAINBOW: this.audio.play(SFX.RAINBOW); this.hud.showColorAlert(COLOR.RAINBOW); return;
            case EVENT.CONSUMABLE_USED: return this.consumable(evt.cardId, evt.seat);
            case EVENT.REVEAL: return this.reveal(evt.cards);
            case EVENT.SUMMON: return this.summon(evt.cardId);
            case EVENT.CLASH: return this.clash(evt.winnerId, evt.loserId, evt.winnerPower);
            case EVENT.TIE: return this.tie(evt.cardIds);
            case EVENT.BLOCK_SMASH: return this.blockSmash(evt.blockId, evt.victimIds);
            case EVENT.REVERSE_STEAL:
            case EVENT.REVERSE_SWAP: return this.reverse(evt.reverseId);
            case EVENT.DIRECT_HIT: return this.directHit(evt);
            case EVENT.DESTROY: return this.destroyMany(evt.cardIds);
            case EVENT.GAME_OVER: return this.gameOver(evt.result, evt.reason);
        }
    }

    /** Aplica só o efeito final do evento, sem animação (aba em segundo plano ou fila atrasada). */
    applyInstant(evt) {
        switch (evt.t) {
            case EVENT.COLOR_CHOSEN: this.hud.syncBackground(evt.color); break;
            case EVENT.RAINBOW: this.hud.syncBackground(COLOR.RAINBOW); break;
            case EVENT.REVEAL: for (const face of evt.cards) this.applyFace(face); break;
            case EVENT.CLASH:
                this.remove(evt.loserId);
                if (this.pool.isActive(evt.winnerId)) this.pool.power[evt.winnerId] = evt.winnerPower;
                break;
            case EVENT.TIE:
            case EVENT.DESTROY: for (const id of evt.cardIds) this.remove(id); break;
            case EVENT.BLOCK_SMASH:
                this.remove(evt.blockId);
                for (const id of evt.victimIds) this.remove(id);
                break;
            case EVENT.REVERSE_STEAL:
            case EVENT.REVERSE_SWAP: this.remove(evt.reverseId); break;
            case EVENT.SUMMON:
            case EVENT.CONSUMABLE_USED: this.remove(evt.cardId); break;
            case EVENT.DIRECT_HIT: if (evt.effect !== HIT_EFFECT.NONE) this.remove(evt.cardId); break;
            case EVENT.GAME_OVER: this.showGameOverScreen(evt.result, evt.reason); break;
        }
    }

    // --- Utilitários -------------------------------------------------------

    centerX(id) { return this.pool.targetX[id] + HALF_W; }
    centerY(id) { return this.pool.targetY[id] + HALF_H; }

    tween(id, props, duration, easing = Easing.QuadOut) {
        return this.animator.toAsync(id, props, duration, easing, this.pool);
    }

    applyFace(face) {
        if (!this.pool.isActive(face.id)) return;
        this.pool.type[face.id] = face.type;
        this.pool.color[face.id] = face.color;
        this.pool.power[face.id] = face.power;
    }

    remove(id) {
        if (!this.pool.isActive(id)) return;
        this.animator.cancel(id, this.pool);
        this.pool.deactivate(id);
    }

    explode(id, color = '#e74c3c', count = 30, speed = 180) {
        if (!this.pool.isActive(id)) return;
        this.particles.emitBurst(this.centerX(id), this.centerY(id), color, count, speed, PARTICLE_TYPES.SQUARE);
        this.particles.emitBurst(this.centerX(id), this.centerY(id), '#ffffff', 10, speed * 0.6, PARTICLE_TYPES.STAR);
        this.remove(id);
    }

    // --- Cinemáticas -------------------------------------------------------

    async reveal(cards) {
        if (cards.length === 0) return;
        this.audio.play(SFX.REVEAL);
        const jobs = [];
        for (const face of cards) {
            const id = face.id;
            if (!this.pool.isActive(id)) continue;
            jobs.push((async () => {
                await this.tween(id, { scale: 1.2 }, ANIM.FLIP_HALF);
                this.applyFace(face);
                this.particles.emitBurst(this.centerX(id), this.centerY(id), '#ffffff', 15, 150, PARTICLE_TYPES.STAR);
                await this.tween(id, { scale: 1.0 }, ANIM.FLIP_HALF);
            })());
        }
        await Promise.all(jobs);
    }

    /** Vencedora "levanta", recua, avança sobre a perdedora e volta ao lugar (GAME_RULES §3.1). */
    async clash(winnerId, loserId, winnerPower) {
        const pool = this.pool;
        if (!pool.isActive(winnerId) || !pool.isActive(loserId)) {
            this.applyInstant({ t: EVENT.CLASH, winnerId, loserId, winnerPower });
            return;
        }

        const homeX = pool.targetX[winnerId];
        const homeY = pool.targetY[winnerId];
        const loserX = pool.targetX[loserId];
        const loserY = pool.targetY[loserId];
        const dir = Math.sign(loserY - homeY) || -1;
        const baseZ = pool.zIndex[winnerId];
        pool.zIndex[winnerId] = 500;

        await this.tween(winnerId, { scale: 1.25, targetY: homeY - dir * 25 }, ANIM.LIFT);
        await this.tween(winnerId, { scale: 1.0, targetX: loserX, targetY: loserY - dir * HALF_H }, ANIM.DASH, Easing.CubicIn);

        this.audio.play(SFX.CLASH);
        this.particles.emitBurst(this.centerX(loserId), this.centerY(loserId), '#f39c12', 30, 220, PARTICLE_TYPES.STAR);
        this.explode(loserId);
        pool.power[winnerId] = winnerPower;

        await this.tween(winnerId, { targetX: homeX, targetY: homeY }, ANIM.RETURN);
        pool.zIndex[winnerId] = baseZ;
    }

    /** Empate: as duas avançam até o meio, colidem e se destroem. */
    async tie(cardIds) {
        const [a, b] = cardIds;
        const pool = this.pool;
        if (!pool.isActive(a) || !pool.isActive(b)) {
            for (const id of cardIds) this.remove(id);
            return;
        }

        const midX = (pool.targetX[a] + pool.targetX[b]) / 2;
        const midY = (pool.targetY[a] + pool.targetY[b]) / 2;
        const dirA = Math.sign(pool.targetY[a] - midY) || 1;
        const dirB = Math.sign(pool.targetY[b] - midY) || -1;

        await Promise.all([
            this.tween(a, { scale: 1.2 }, ANIM.LIFT),
            this.tween(b, { scale: 1.2 }, ANIM.LIFT)
        ]);
        await Promise.all([
            this.tween(a, { targetX: midX, targetY: midY + dirA * 20 }, ANIM.DASH, Easing.CubicIn),
            this.tween(b, { targetX: midX, targetY: midY + dirB * 20 }, ANIM.DASH, Easing.CubicIn)
        ]);

        this.audio.play(SFX.TIE);
        this.particles.emitBurst(midX + HALF_W, midY + HALF_H, '#bdc3c7', 40, 250, PARTICLE_TYPES.SQUARE);
        this.explode(a);
        this.explode(b);
        await sleep(ANIM.RETURN);
    }

    async summon(cardId) {
        const pool = this.pool;
        if (!pool.isActive(cardId)) return;

        this.audio.play(SFX.SUMMON);
        this.particles.emitBurst(this.centerX(cardId), this.centerY(cardId), '#9b59b6', 150, 600, PARTICLE_TYPES.STAR);
        const baseX = pool.targetX[cardId];
        for (let i = 0; i < 4; i++) {
            const scale = 1.1 + i * 0.1;
            await this.tween(cardId, { targetX: baseX - 15, scale }, ANIM.SHAKE_STEP, Easing.Linear);
            await this.tween(cardId, { targetX: baseX + 15, scale }, ANIM.SHAKE_STEP, Easing.Linear);
        }
        this.particles.emitBurst(this.centerX(cardId), this.centerY(cardId), '#ffffff', 200, 900, PARTICLE_TYPES.SQUARE);
        this.remove(cardId);
    }

    async blockSmash(blockId, victimIds) {
        const pool = this.pool;
        this.audio.play(SFX.BLOCK);
        if (pool.isActive(blockId)) {
            await this.tween(blockId, { scale: 1.3 }, ANIM.LIFT);
            this.particles.emitBurst(this.centerX(blockId), this.centerY(blockId), '#ff0000', 80, 400, PARTICLE_TYPES.CIRCLE);
        }
        for (const id of victimIds) this.explode(id, '#8e44ad');
        this.explode(blockId, '#ff0000');
        await sleep(ANIM.RETURN);
    }

    async reverse(reverseId) {
        const pool = this.pool;
        if (!pool.isActive(reverseId)) return;
        this.audio.play(SFX.REVERSE);
        const rotation = pool.rotation[reverseId];
        await this.tween(reverseId, { rotation: rotation + Math.PI * 2, scale: 1.3 }, ANIM.LIFT * 2, Easing.QuadInOut);
        this.particles.emitBurst(this.centerX(reverseId), this.centerY(reverseId), '#1abc9c', 80, 400, PARTICLE_TYPES.STAR);
        this.remove(reverseId);
    }

    /** A carta (face para baixo, se for do oponente) pousa no slot USE do dono e explode ali. */
    async consumable(cardId, seat) {
        const pool = this.pool;
        if (!pool.isActive(cardId)) return;

        const rect = this.board.slots[seat === REL_SEAT.SELF ? ZONE.SELF_USE : ZONE.OPP_USE];
        pool.zIndex[cardId] = 500;
        pool.hoverOffsetY[cardId] = 0;
        if (rect) {
            await this.tween(cardId, { targetX: rect.x, targetY: rect.y, rotation: 0, scale: 1 }, ANIM.CONSUMABLE_MOVE, Easing.CubicOut);
        }
        await sleep(ANIM.CONSUMABLE_HOLD);
        await this.tween(cardId, { scale: 1.3 }, ANIM.CONSUMABLE_LIFT);
        this.audio.play(SFX.CONSUMABLE);
        this.particles.emitBurst(this.centerX(cardId), this.centerY(cardId), '#ffffff', 40, 200, PARTICLE_TYPES.STAR);
        this.explode(cardId, '#9b59b6');
    }

    /** Carta sobe, recua e dispara contra a vida do alvo. `seat` é o atacante (relativo). */
    async directHit(evt) {
        const pool = this.pool;
        const id = evt.cardId;
        const selfIsTarget = evt.seat === REL_SEAT.OPPONENT;

        if (pool.isActive(id)) {
            const startX = pool.targetX[id];
            const startY = pool.targetY[id];
            const exitY = selfIsTarget ? this.viewport.height + 100 : -CARD_DIMENSIONS.HEIGHT - 100;
            const recoilY = selfIsTarget ? startY - 30 : startY + 30;
            pool.zIndex[id] = 500;

            await this.tween(id, { scale: 1.3 }, ANIM.DIRECT_LIFT);
            await this.tween(id, { targetY: recoilY }, ANIM.DIRECT_RECOIL);
            await this.tween(id, { targetY: exitY, scale: 1.0 }, ANIM.DIRECT_DASH, Easing.CubicIn);
            this.impact(evt, selfIsTarget);

            if (evt.effect !== HIT_EFFECT.NONE) {
                this.remove(id);
                await sleep(ANIM.DIRECT_RETURN);
            } else {
                await this.tween(id, { targetX: startX, targetY: startY }, ANIM.DIRECT_RETURN);
            }
        } else {
            this.impact(evt, selfIsTarget);
        }
    }

    impact(evt, selfIsTarget) {
        this.audio.play(SFX.DIRECT_HIT);
        this.particles.emitDamageWave(selfIsTarget, '#ff0000', 150, PARTICLE_TYPES.SQUARE);
        if (selfIsTarget) this.hud.flashDamage();

        let text;
        if (evt.effect === HIT_EFFECT.LOCKOUT) {
            text = 'BLOQUEIO!';
            this.audio.play(SFX.LOCKOUT);
        } else if (evt.effect === HIT_EFFECT.HAND_SWAP) {
            text = 'TROCA DE MÃOS!';
            this.audio.play(SFX.HAND_SWAP);
        } else {
            text = `-${evt.damage} ♥`;
            this.audio.play(SFX.DAMAGE);
        }
        this.hud.showFloatingText(text, selfIsTarget);
    }

    async destroyMany(cardIds) {
        if (cardIds.length === 0) return;
        this.audio.play(SFX.DESTROY);
        for (const id of cardIds) this.explode(id, '#ff3333', 40, 220);
        await sleep(CONFIG.TIMINGS.DESTROY);
    }

    /** Cartas do perdedor explodem, e cada jogador vê sua própria tela (vitória ou derrota). */
    async gameOver(result, reason) {
        if (this.gameOverShown) return;
        const pool = this.pool;
        const loserRelSeat = result === GAME_RESULT.VICTORY ? REL_SEAT.OPPONENT : REL_SEAT.SELF;
        const spread = CONFIG.TIMINGS.GAME_OVER_SEQUENCE * 0.8;

        for (let id = 0; id < pool.maxCards; id++) {
            if (pool.active[id] !== 1 || zoneSeat(pool.zone[id]) !== loserRelSeat) continue;
            setTimeout(() => {
                if (!pool.isActive(id)) return;
                this.particles.emitBurst(this.centerX(id), this.centerY(id), '#ff3333', 150, 600, PARTICLE_TYPES.STAR);
                this.remove(id);
            }, Math.random() * spread);
        }

        await sleep(CONFIG.TIMINGS.GAME_OVER_SEQUENCE);
        const explosionY = loserRelSeat === REL_SEAT.SELF ? this.viewport.height - 100 : 100;
        this.particles.emitBurst(this.viewport.width / 2, explosionY, '#ff0000', 300, 1000, PARTICLE_TYPES.STAR);
        this.showGameOverScreen(result, reason);
    }

    /** Revanche: encerra os fogos de artifício e libera a tela de fim de jogo para a próxima partida. */
    reset() {
        clearInterval(this.fireworksTimer);
        this.fireworksTimer = null;
        this.gameOverShown = false;
    }

    showGameOverScreen(result, reason) {
        if (this.gameOverShown) return;
        this.gameOverShown = true;
        this.audio.play(result === GAME_RESULT.VICTORY ? SFX.VICTORY : SFX.DEFEAT);

        if (result === GAME_RESULT.VICTORY && !this.fireworksTimer) {
            this.fireworksTimer = setInterval(() => {
                const color = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
                this.particles.emitBurst(Math.random() * this.viewport.width, Math.random() * this.viewport.height / 2, color, 50, 400, PARTICLE_TYPES.STAR);
            }, 500);
        }
        this.hud.showGameOver(result, reason);
    }
}
