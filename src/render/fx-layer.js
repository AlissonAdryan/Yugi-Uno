import { CONFIG } from '../config/constants.js';

const { CARD_DIMENSIONS } = CONFIG;
const HALF_W = CARD_DIMENSIONS.WIDTH / 2;
const HALF_H = CARD_DIMENSIONS.HEIGHT / 2;
const MAX_RINGS = 24;
const MAX_TETHERS = 8;
const TAU = Math.PI * 2;

/** Estilos de amarra (tether) entre um ponto e uma carta. */
export const TETHER = Object.freeze({
    CHAIN: 0,   // corrente fantasmagórica roxa (Maldição)
    THREAD: 1   // fio espinhoso verde-tóxico (Emboscada)
});

// Cores prontas por estilo (nenhuma string montada por frame)
const TETHER_STYLE = [
    { glow: 'rgba(160, 60, 255, 0.35)', body: '#c28bff', core: '#f1e2ff', spacing: 9 },
    { glow: 'rgba(57, 255, 20, 0.3)', body: '#6dff4a', core: '#e9ffe0', spacing: 11 }
];

/**
 * FxLayer - efeitos de mesa por cima das cartas, em pools fixos (SoA, zero alocação por frame):
 *  - ring: onda de choque/distorção expandindo (Fantasma, Espelho, Maldição, Emboscada)
 *  - tether: corrente ou fio que sai de um ponto, alcança uma carta e a envolve em X (segue a carta)
 *  - vignette: bordas da tela tingidas (Maldição), com entrada/saída suaves
 * Contrato: as cinemáticas chamam ring/tether/vignette; o renderer chama update(dt) + draw(ctx) por frame.
 */
export class FxLayer {
    /** @param {import('../entities/card-pool.js').CardPool} pool */
    constructor(pool) {
        this.pool = pool;

        this.ringActive = new Uint8Array(MAX_RINGS);
        this.ringX = new Float32Array(MAX_RINGS);
        this.ringY = new Float32Array(MAX_RINGS);
        this.ringR0 = new Float32Array(MAX_RINGS);
        this.ringR1 = new Float32Array(MAX_RINGS);
        this.ringLife = new Float32Array(MAX_RINGS);
        this.ringMax = new Float32Array(MAX_RINGS);
        this.ringWidth = new Float32Array(MAX_RINGS);
        this.ringSquash = new Float32Array(MAX_RINGS);
        this.ringColor = new Array(MAX_RINGS).fill('#ffffff');

        this.tetherActive = new Uint8Array(MAX_TETHERS);
        this.tetherX = new Float32Array(MAX_TETHERS);
        this.tetherY = new Float32Array(MAX_TETHERS);
        this.tetherCard = new Int16Array(MAX_TETHERS);
        this.tetherLife = new Float32Array(MAX_TETHERS);
        this.tetherMax = new Float32Array(MAX_TETHERS);
        this.tetherKind = new Uint8Array(MAX_TETHERS);
        this.time = 0;

        this.vigAmount = 0;
        this.vigLife = 0;
        this.vigMax = 0;
        this.vigPeak = 0;
        this.vigSprite = null;
        this.vigSprites = new Map();

        // Aparição: um sprite grande que surge, cresce e se desfaz (ex.: a caveira da Maldição)
        this.appSprite = null;
        this.appX = 0;
        this.appY = 0;
        this.appSize0 = 0;
        this.appSize1 = 0;
        this.appLife = 0;
        this.appMax = 0;
        this.appPeak = 0;
    }

    /** Sprite surgindo em (x, y), crescendo de size0 a size1 e sumindo (entra rápido, sai devagar). */
    apparition(sprite, x, y, size0, size1, durationMs, peakAlpha = 0.8) {
        this.appSprite = sprite;
        this.appX = x;
        this.appY = y;
        this.appSize0 = size0;
        this.appSize1 = size1;
        this.appLife = durationMs;
        this.appMax = durationMs;
        this.appPeak = peakAlpha;
    }

    /**
     * Onda circular (ou achatada com squash < 1) crescendo de r0 a r1 e sumindo.
     * @param {string} hex cor #rrggbb
     */
    ring(x, y, r0, r1, durationMs, hex, width = 3, squash = 1) {
        let slot = 0;
        for (let i = 0; i < MAX_RINGS; i++) {
            if (this.ringActive[i] === 0) { slot = i; break; }
            if (this.ringLife[i] < this.ringLife[slot]) slot = i;
        }
        this.ringActive[slot] = 1;
        this.ringX[slot] = x;
        this.ringY[slot] = y;
        this.ringR0[slot] = r0;
        this.ringR1[slot] = r1;
        this.ringLife[slot] = durationMs;
        this.ringMax[slot] = durationMs;
        this.ringWidth[slot] = width;
        this.ringSquash[slot] = squash;
        this.ringColor[slot] = hex;
    }

    /**
     * Amarra de (x, y) até a carta `cardId`: cresce até ela, envolve em X e some no fim.
     * @param {number} kind TETHER.*
     */
    tether(x, y, cardId, durationMs, kind) {
        let slot = 0;
        for (let i = 0; i < MAX_TETHERS; i++) {
            if (this.tetherActive[i] === 0) { slot = i; break; }
            if (this.tetherLife[i] < this.tetherLife[slot]) slot = i;
        }
        this.tetherActive[slot] = 1;
        this.tetherX[slot] = x;
        this.tetherY[slot] = y;
        this.tetherCard[slot] = cardId;
        this.tetherLife[slot] = durationMs;
        this.tetherMax[slot] = durationMs;
        this.tetherKind[slot] = kind;
    }

    /** Bordas da tela tingidas por `durationMs` (entra rápido, segura e sai suave). */
    vignette(hex, peak, durationMs) {
        this.vigSprite = this.getVignetteSprite(hex);
        this.vigPeak = peak;
        this.vigLife = durationMs;
        this.vigMax = durationMs;
    }

    clear() {
        this.ringActive.fill(0);
        this.tetherActive.fill(0);
        this.vigLife = 0;
        this.vigAmount = 0;
        this.appLife = 0;
    }

    /** Vinheta radial pré-rasterizada por cor (uma vez por cor, nunca por frame). */
    getVignetteSprite(hex) {
        let sprite = this.vigSprites.get(hex);
        if (sprite) return sprite;
        const size = 256;
        sprite = document.createElement('canvas');
        sprite.width = size;
        sprite.height = size;
        const g = sprite.getContext('2d');
        const r = parseInt(hex.slice(1, 3), 16);
        const gr = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const grad = g.createRadialGradient(size / 2, size / 2, size * 0.22, size / 2, size / 2, size * 0.72);
        grad.addColorStop(0, `rgba(${r},${gr},${b},0)`);
        grad.addColorStop(0.6, `rgba(${r},${gr},${b},0.45)`);
        grad.addColorStop(1, `rgba(${r},${gr},${b},0.95)`);
        g.fillStyle = grad;
        g.fillRect(0, 0, size, size);
        this.vigSprites.set(hex, sprite);
        return sprite;
    }

    /** @param {number} dt ms */
    update(dt) {
        this.time += dt / 1000;
        for (let i = 0; i < MAX_RINGS; i++) {
            if (this.ringActive[i] === 0) continue;
            this.ringLife[i] -= dt;
            if (this.ringLife[i] <= 0) this.ringActive[i] = 0;
        }
        for (let i = 0; i < MAX_TETHERS; i++) {
            if (this.tetherActive[i] === 0) continue;
            this.tetherLife[i] -= dt;
            if (this.tetherLife[i] <= 0 || this.pool.active[this.tetherCard[i]] !== 1) this.tetherActive[i] = 0;
        }
        if (this.appLife > 0) this.appLife -= dt;
        if (this.vigLife > 0) {
            this.vigLife -= dt;
            const t = 1 - Math.max(0, this.vigLife) / this.vigMax;
            const env = t < 0.2 ? t / 0.2 : t > 0.7 ? (1 - t) / 0.3 : 1;
            this.vigAmount = this.vigPeak * env;
        } else {
            this.vigAmount = 0;
        }
    }

    /**
     * @param {CanvasRenderingContext2D} ctx em coordenadas virtuais
     * @param {number} width largura virtual da tela
     * @param {number} height altura virtual da tela
     */
    draw(ctx, width, height) {
        if (this.vigAmount > 0.001 && this.vigSprite) {
            ctx.save();
            ctx.globalAlpha = Math.min(1, this.vigAmount);
            ctx.drawImage(this.vigSprite, -width * 0.1, -height * 0.1, width * 1.2, height * 1.2);
            ctx.restore();
        }

        if (this.appLife > 0 && this.appSprite) {
            const t = 1 - this.appLife / this.appMax;
            const e = 1 - (1 - t) * (1 - t);
            const size = this.appSize0 + (this.appSize1 - this.appSize0) * e;
            ctx.save();
            ctx.globalAlpha = this.appPeak * (t < 0.2 ? t / 0.2 : (1 - t) / 0.8);
            ctx.drawImage(this.appSprite, this.appX - size / 2, this.appY - size / 2, size, size);
            ctx.restore();
        }

        let anyRing = false;
        for (let i = 0; i < MAX_RINGS; i++) if (this.ringActive[i] === 1) { anyRing = true; break; }
        if (anyRing) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < MAX_RINGS; i++) {
                if (this.ringActive[i] === 0) continue;
                const t = 1 - this.ringLife[i] / this.ringMax[i];
                const e = 1 - (1 - t) * (1 - t);
                const r = this.ringR0[i] + (this.ringR1[i] - this.ringR0[i]) * e;
                const fade = 1 - t;
                ctx.strokeStyle = this.ringColor[i];
                ctx.beginPath();
                ctx.ellipse(this.ringX[i], this.ringY[i], r, r * this.ringSquash[i], 0, 0, TAU);
                // Halo largo e fraco + fio fino e forte: parece uma onda de distorção, não um traço
                ctx.globalAlpha = fade * 0.25;
                ctx.lineWidth = this.ringWidth[i] * 4 * (0.5 + fade);
                ctx.stroke();
                ctx.globalAlpha = fade * 0.9;
                ctx.lineWidth = this.ringWidth[i] * (0.4 + fade * 0.6);
                ctx.stroke();
            }
            ctx.restore();
        }

        for (let i = 0; i < MAX_TETHERS; i++) {
            if (this.tetherActive[i] === 1) this.drawTether(ctx, i);
        }
    }

    drawTether(ctx, i) {
        const pool = this.pool;
        const id = this.tetherCard[i];
        const scale = pool.scale[id] || 1;
        const cx = pool.x[id] + HALF_W;
        const cy = pool.y[id] + pool.hoverOffsetY[id] + HALF_H;
        const t = 1 - this.tetherLife[i] / this.tetherMax[i];
        // 0..0.35 cresce até a carta; 0.25..0.55 envolve em X; últimos 20% somem
        const reach = Math.min(1, t / 0.35);
        const wrap = Math.max(0, Math.min(1, (t - 0.25) / 0.3));
        const alpha = t > 0.8 ? (1 - t) / 0.2 : 1;
        const style = TETHER_STYLE[this.tetherKind[i]];
        const x0 = this.tetherX[i];
        const y0 = this.tetherY[i];
        const x1 = x0 + (cx - x0) * reach;
        const y1 = y0 + (cy - y0) * reach;
        const hw = HALF_W * scale * 1.05;
        const hh = HALF_H * scale * 1.02;
        const sway = Math.sin(this.time * 9 + i) * 2.5;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        this.drawStrand(ctx, style, this.tetherKind[i], x0, y0, x1, y1 + sway, alpha);
        if (wrap > 0) {
            // As duas diagonais atravessando a carta, crescendo do centro pras pontas
            this.drawStrand(ctx, style, this.tetherKind[i], cx - hw * wrap, cy - hh * wrap, cx + hw * wrap, cy + hh * wrap, alpha);
            this.drawStrand(ctx, style, this.tetherKind[i], cx + hw * wrap, cy - hh * wrap, cx - hw * wrap, cy + hh * wrap, alpha);
        }
        ctx.restore();
    }

    /** Uma corrente (elos alternados) ou fio espinhoso entre dois pontos, com halo. */
    drawStrand(ctx, style, kind, x0, y0, x1, y1, alpha) {
        const dx = x1 - x0;
        const dy = y1 - y0;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1) return;
        const ux = dx / len;
        const uy = dy / len;
        const angle = Math.atan2(dy, dx);

        // Halo contínuo por baixo
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = style.glow;
        ctx.lineWidth = kind === TETHER.CHAIN ? 10 : 7;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();

        if (kind === TETHER.CHAIN) {
            ctx.strokeStyle = style.body;
            ctx.lineWidth = 1.8;
            const n = Math.floor(len / style.spacing);
            for (let k = 0; k <= n; k++) {
                const px = x0 + ux * k * style.spacing;
                const py = y0 + uy * k * style.spacing;
                ctx.beginPath();
                // Elos alternam de frente e de lado (o de lado vira um traço fino)
                if (k % 2 === 0) ctx.ellipse(px, py, style.spacing * 0.62, 3.2, angle, 0, TAU);
                else ctx.ellipse(px, py, style.spacing * 0.62, 0.9, angle, 0, TAU);
                ctx.stroke();
            }
        } else {
            ctx.strokeStyle = style.body;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.stroke();
            // Espinhos alternando de lado
            const n = Math.floor(len / style.spacing);
            ctx.beginPath();
            for (let k = 1; k <= n; k++) {
                const px = x0 + ux * k * style.spacing;
                const py = y0 + uy * k * style.spacing;
                const side = k % 2 === 0 ? 1 : -1;
                ctx.moveTo(px, py);
                ctx.lineTo(px - ux * 4 - uy * 5 * side, py - uy * 4 + ux * 5 * side);
            }
            ctx.stroke();
        }
        ctx.strokeStyle = style.core;
        ctx.globalAlpha = alpha * 0.6;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
    }
}
