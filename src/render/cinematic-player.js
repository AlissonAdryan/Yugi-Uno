import { CONFIG } from '../config/constants.js';
import { Easing } from './animator.js';
import { PARTICLE_TYPES } from './particle-system.js';
import { EVENT, GAME_RESULT, HIT_EFFECT, REL_SEAT } from '../network/protocol.js';
import { SFX } from '../config/sound-presets.js';
import { ZONE, zoneSeat } from '../utils/zones.js';
import { i18n } from '../i18n/index.js';

const { ANIM, CARD_DIMENSIONS, COLOR, CARD_TYPES } = CONFIG;
const HALF_W = CARD_DIMENSIONS.WIDTH / 2;
const HALF_H = CARD_DIMENSIONS.HEIGHT / 2;
const FIREWORK_COLORS = ['#2ecc71', '#f1c40f', '#3498db', '#9b59b6'];

// Explosão do consumível ao ser usado. Só o dono conhece o tipo (o oponente vê o verso: efeito genérico).
// `toLife`: a energia da carta corre do slot USE até a caixa de vida do dono.
const CONSUMABLE_FX_DEFAULT = Object.freeze({ color: '#9b59b6', sound: SFX.CONSUMABLE, toLife: false });
const CONSUMABLE_FX = Object.freeze({
    [CARD_TYPES.CHANGE_COLOR]: CONSUMABLE_FX_DEFAULT,
    [CARD_TYPES.HEAL]: Object.freeze({ color: '#2ecc71', sound: SFX.HEAL_USE, toLife: true }),
    [CARD_TYPES.SHIELD]: Object.freeze({ color: '#00e5ff', sound: SFX.SHIELD_UP, toLife: true }),
    [CARD_TYPES.REVIVE]: Object.freeze({ color: '#ffd700', sound: SFX.REVIVE_USE, toLife: true })
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Rachaduras da carta gigante: polilinhas do centro pras bordas, em coordenadas de carta (100x150). */
function makeCracks() {
    const cracks = [];
    const count = 7;
    const cx = CARD_DIMENSIONS.WIDTH / 2;
    const cy = CARD_DIMENSIONS.HEIGHT * 0.48;
    for (let c = 0; c < count; c++) {
        const baseAngle = (c / count) * Math.PI * 2 + Math.random() * 0.5;
        const steps = 5;
        const pts = new Float32Array((steps + 1) * 2);
        pts[0] = cx;
        pts[1] = cy;
        let x = cx;
        let y = cy;
        for (let s = 1; s <= steps; s++) {
            const angle = baseAngle + (Math.random() - 0.5) * 0.9;
            const len = 9 + Math.random() * 9;
            x += Math.cos(angle) * len;
            y += Math.sin(angle) * len;
            pts[s * 2] = x;
            pts[s * 2 + 1] = y;
        }
        cracks.push(pts);
    }
    return cracks;
}

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
    constructor({ pool, animator, particles, hud, board, viewport, audio, showcase }) {
        this.pool = pool;
        this.board = board;
        this.viewport = viewport;
        this.animator = animator;
        this.particles = particles;
        this.hud = hud;
        this.audio = audio;
        // Carta gigante do centro (estado lido pelo renderer em scene.showcase)
        this.showcase = showcase;
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
            case EVENT.HEAL: return this.heal(evt);
            case EVENT.REVIVE_TRIGGERED: return this.reviveSave(evt.seat);
            case EVENT.CARD_SOLD: return this.cardSold(evt);
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
            case EVENT.CARD_SOLD: this.remove(evt.cardId); break;
        }
    }

    // --- Utilitários -------------------------------------------------------

    /** Centro da caixa de vida (DOM) em coordenadas virtuais do canvas, pra partículas nascerem ali. */
    hpPoint(isSelf) {
        const c = this.hud.hpCenter(isSelf);
        return { x: this.viewport.toVirtual(c.x), y: this.viewport.toVirtual(c.y) };
    }

    /**
     * Anima um valor 0..1 por `duration` ms (rAF), com timeout de segurança: nunca trava a fila de
     * eventos, nem com a aba em segundo plano (o setTimeout finaliza no valor final).
     */
    animate(duration, onUpdate) {
        return new Promise((resolve) => {
            const start = performance.now();
            let done = false;
            let timer = null;
            const finish = () => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                onUpdate(1);
                resolve();
            };
            const step = (now) => {
                if (done) return;
                const t = Math.min(1, (now - start) / duration);
                if (t >= 1) {
                    finish();
                    return;
                }
                onUpdate(t);
                requestAnimationFrame(step);
            };
            timer = setTimeout(finish, duration + ANIM.SAFETY_MARGIN);
            requestAnimationFrame(step);
        });
    }

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

    /**
     * A carta (face para baixo, se for do oponente) pousa no slot USE do dono e explode ali. Para o
     * dono, a explosão tem a cor/som do consumível e a energia corre até a sua caixa de vida.
     */
    async consumable(cardId, seat) {
        const pool = this.pool;
        if (!pool.isActive(cardId)) return;

        const isSelf = seat === REL_SEAT.SELF;
        const fx = (isSelf && CONSUMABLE_FX[pool.type[cardId]]) || CONSUMABLE_FX_DEFAULT;
        const type = pool.type[cardId];
        const rect = this.board.slots[isSelf ? ZONE.SELF_USE : ZONE.OPP_USE];
        pool.zIndex[cardId] = 500;
        pool.hoverOffsetY[cardId] = 0;
        if (rect) {
            await this.tween(cardId, { targetX: rect.x, targetY: rect.y, rotation: 0, scale: 1 }, ANIM.CONSUMABLE_MOVE, Easing.CubicOut);
        }
        await sleep(ANIM.CONSUMABLE_HOLD);
        await this.tween(cardId, { scale: 1.3 }, ANIM.CONSUMABLE_LIFT);
        this.audio.play(fx.sound);

        const x = this.centerX(cardId);
        const y = this.centerY(cardId);
        this.particles.emitBurst(x, y, '#ffffff', 40, 200, PARTICLE_TYPES.STAR);
        if (fx.toLife) {
            const life = this.hpPoint(true);
            this.particles.emitLine(x, y, life.x, life.y, fx.color, 45, PARTICLE_TYPES.STAR);
            this.particles.emitRise(life.x, life.y, fx.color, 30, 45, 260, PARTICLE_TYPES.STAR);
            if (isSelf && type === CARD_TYPES.REVIVE) {
                this.particles.emitRise(x, y, '#fff3b0', 50, 40, 420, PARTICLE_TYPES.CIRCLE);
                this.hud.flashGuard(true);
            }
        }
        this.explode(cardId, fx.color);
    }

    /**
     * Carta vendida: voa girando até a lixeira do dono, encolhe e queima virando moedas. O oponente
     * vê o verso indo pra lixeira dele e a brasa, mas nunca o valor (só quem vendeu recebe `coins`).
     */
    async cardSold(evt) {
        const pool = this.pool;
        const id = evt.cardId;
        const isSelf = evt.seat === REL_SEAT.SELF;
        const t = this.hud.trashCenter(isSelf);
        const tx = this.viewport.toVirtual(t.x);
        const ty = this.viewport.toVirtual(t.y);

        if (pool.isActive(id)) {
            pool.zIndex[id] = 600;
            pool.hoverOffsetY[id] = 0;
            const spin = isSelf ? 0.6 : -0.6;
            await this.tween(id, {
                targetX: tx - HALF_W, targetY: ty - HALF_H, scale: isSelf ? 0.5 : 0.35, rotation: pool.rotation[id] + spin
            }, ANIM.SELL_FLY, Easing.CubicIn);
            await this.tween(id, { scale: 0.05, rotation: pool.rotation[id] + spin * 2 }, ANIM.SELL_BURN, Easing.QuadIn);
            this.remove(id);
        }

        this.hud.trashSold(isSelf, isSelf ? evt.coins : 0);
        this.audio.play(SFX.SELL, isSelf ? undefined : { volume: 0.5 });
        this.particles.emitBurst(tx, ty, '#ff8a00', isSelf ? 34 : 18, 260, PARTICLE_TYPES.SQUARE);
        this.particles.emitRise(tx, ty, '#7f8c8d', isSelf ? 14 : 8, 14, 140, PARTICLE_TYPES.CIRCLE);
        if (isSelf && evt.coins > 0) {
            this.particles.emitRise(tx, ty, '#ffd700', Math.min(45, 8 + evt.coins * 4), 18, 360, PARTICLE_TYPES.STAR);
            this.particles.emitBurst(tx, ty, '#fff3b0', 16, 200, PARTICLE_TYPES.CIRCLE);
        }
    }

    /** Cura resolvida no fim do combate (amount 0 = desperdiçada, só quem usou recebe esse aviso). */
    async heal(evt) {
        const isSelf = evt.seat === REL_SEAT.SELF;
        const p = this.hpPoint(isSelf);
        if (!(evt.amount > 0)) {
            this.audio.play(SFX.FIZZLE);
            this.hud.playHealFizzle();
            this.particles.emitRise(p.x, p.y, '#95a5a6', 25, 40, 160, PARTICLE_TYPES.CIRCLE);
            return;
        }
        this.audio.play(SFX.HEAL);
        this.hud.playHealBurst(isSelf);
        this.particles.emitRise(p.x, p.y, '#2ecc71', 60, 70, 380, PARTICLE_TYPES.STAR);
        this.particles.emitRise(p.x, p.y, '#b6ffd6', 40, 60, 300, PARTICLE_TYPES.CIRCLE);
        this.hud.showFloatingText(`+${evt.amount} ♥`, isSelf, 'heal');
        await sleep(ANIM.HEAL_BURST);
    }

    /**
     * Reviver salvou `seat` da morte (os dois veem): luz divina na caixa de vida do alvo e, em seguida,
     * a carta do Reviver aparece gigante no centro, racha e se despedaça.
     */
    async reviveSave(seat) {
        const isSelf = seat === REL_SEAT.SELF;
        const p = this.hpPoint(isSelf);
        this.audio.play(SFX.REVIVE_SAVE);
        this.hud.playDivine(isSelf);
        this.particles.emitRise(p.x, p.y, '#ffd700', 70, 60, 420, PARTICLE_TYPES.STAR);
        this.particles.emitRise(p.x, p.y, '#ffffff', 40, 50, 320, PARTICLE_TYPES.CIRCLE);
        this.particles.emitBurst(p.x, p.y, '#fff3b0', 50, 260, PARTICLE_TYPES.STAR);
        await sleep(ANIM.DIVINE_LEAD * 0.5);
        this.particles.emitRise(p.x, p.y, '#ffe680', 50, 70, 360, PARTICLE_TYPES.STAR);
        await sleep(ANIM.DIVINE_LEAD * 0.5);
        await this.showcaseShatter(CARD_TYPES.REVIVE);
    }

    /** Carta gigante no centro: entra com impulso, fica brilhando, racha tremendo e explode em estilhaços. */
    async showcaseShatter(type) {
        const sc = this.showcase;
        if (!sc) return;
        const target = ANIM.SHOWCASE_SCALE;
        sc.type = type;
        sc.color = COLOR.BLACK;
        sc.cracks = makeCracks();
        sc.crack = 0;
        sc.shakeX = 0;
        sc.shakeY = 0;
        sc.cardVisible = true;

        this.audio.play(SFX.SPARKLE);
        await this.animate(ANIM.SHOWCASE_IN, (t) => {
            const e = Easing.BackOut(t);
            sc.scale = 0.3 + (target - 0.3) * e;
            sc.alpha = Math.min(1, t * 2);
            sc.dim = 0.5 * t;
            sc.glow = t;
            sc.rotation = -0.25 * (1 - e);
        });
        await sleep(ANIM.SHOWCASE_HOLD);

        await this.animate(ANIM.SHOWCASE_CRACK, (t) => {
            const amp = 7 * t;
            sc.crack = t;
            sc.shakeX = (Math.random() - 0.5) * amp;
            sc.shakeY = (Math.random() - 0.5) * amp;
            sc.scale = target + 0.1 * t;
        });

        const cx = this.viewport.width / 2;
        const cy = this.viewport.height / 2;
        this.audio.play(SFX.REVIVE_SHATTER);
        // Estilhaços: lascas douradas grandes, riscos de vidro, brilhos e poeira de luz
        this.particles.emitBurst(cx, cy, '#ffd700', 150, 1100, PARTICLE_TYPES.SQUARE, 2.2);
        this.particles.emitBurst(cx, cy, '#fffbe6', 90, 900, PARTICLE_TYPES.SQUARE, 1.6);
        this.particles.emitBurst(cx, cy, '#ffe9a3', 70, 1300, PARTICLE_TYPES.SPARK, 1.3);
        this.particles.emitBurst(cx, cy, '#ffffff', 80, 700, PARTICLE_TYPES.STAR, 2);
        this.particles.emitBurst(cx, cy, '#fff3b0', 40, 350, PARTICLE_TYPES.CIRCLE, 2.5);
        sc.cardVisible = false;
        sc.crack = 0;
        sc.shakeX = 0;
        sc.shakeY = 0;
        sc.flash = 1;

        await this.animate(ANIM.SHOWCASE_FADE, (t) => {
            sc.flash = 1 - Easing.QuadOut(t);
            sc.dim = 0.5 * (1 - t);
            sc.glow = 1 - t;
        });
        sc.flash = 0;
        sc.dim = 0;
        sc.glow = 0;
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
        let variant = '';
        if (evt.effect === HIT_EFFECT.LOCKOUT) {
            text = i18n.t('HIT_LOCKOUT');
            this.audio.play(SFX.LOCKOUT);
        } else if (evt.effect === HIT_EFFECT.HAND_SWAP) {
            text = i18n.t('HIT_HAND_SWAP');
            this.audio.play(SFX.HAND_SWAP);
        } else {
            text = `-${evt.damage} ♥`;
            this.audio.play(SFX.DAMAGE);
            // `absorbed` só chega para o alvo (o Escudo é secreto pro atacante)
            if (selfIsTarget && evt.absorbed > 0) {
                variant = 'shielded';
                this.hud.flashShield();
                this.audio.play(SFX.SHIELD_HIT);
                const p = this.hpPoint(true);
                this.particles.emitBurst(p.x, p.y, '#7df9ff', 45, 280, PARTICLE_TYPES.STAR);
            }
            if (evt.guarded) {
                variant = 'guarded';
                this.hud.flashGuard(selfIsTarget);
                const p = this.hpPoint(selfIsTarget);
                this.particles.emitRise(p.x, p.y, '#ffd700', 35, 45, 300, PARTICLE_TYPES.STAR);
            }
        }
        this.hud.showFloatingText(text, selfIsTarget, variant);
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
        if (this.showcase) {
            this.showcase.cardVisible = false;
            this.showcase.dim = 0;
            this.showcase.glow = 0;
            this.showcase.flash = 0;
        }
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
