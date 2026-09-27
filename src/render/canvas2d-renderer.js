import { CONFIG } from '../config/constants.js';
import { CardArt, drawHealIcon, drawShieldIcon } from './card-art.js';
import { CardEffects } from './card-effects.js';

const { CARD_TYPES, COLOR_HEX, COLOR, CARD_DIMENSIONS, CARD_VISUALS } = CONFIG;
const NUMBER_LABELS = Array.from({ length: 64 }, (_, i) => String(i));
const HEART_LABELS = Array.from({ length: 64 }, (_, i) => `♥ ${i}`);
const DECK_PILE_MAX = 5;
const WHEEL_COLORS = [COLOR.RED, COLOR.BLUE, COLOR.GREEN, COLOR.YELLOW];
const WHEEL_STARTS = [Math.PI, Math.PI * 1.5, 0, Math.PI * 0.5];
const FRAME_MS = 1000 / 60;

const OUTLINE = CONFIG.PLAYABLE_OUTLINE;
const OUTLINE_POS = -OUTLINE.PADDING;
const OUTLINE_W = CARD_DIMENSIONS.WIDTH + OUTLINE.PADDING * 2;
const OUTLINE_H = CARD_DIMENSIONS.HEIGHT + OUTLINE.PADDING * 2;
const OUTLINE_R = CARD_DIMENSIONS.RADIUS + OUTLINE.PADDING;
// Período que divide o perímetro exatamente: o padrão tracejado fecha o laço sem emenda visível
const OUTLINE_PERIMETER = 2 * (OUTLINE_W + OUTLINE_H) - 8 * OUTLINE_R + 2 * Math.PI * OUTLINE_R;
const OUTLINE_PERIOD = OUTLINE_PERIMETER / OUTLINE.DASH_COUNT;
const OUTLINE_DASH = [OUTLINE_PERIOD * OUTLINE.DASH_FILL, OUTLINE_PERIOD * (1 - OUTLINE.DASH_FILL)];

/**
 * Canvas2DRenderer - backend de renderização 2D (Pilar 2/7: interface draw(scene)).
 *
 * scene = { deckX, deckY, deckCount, hoveredCard, selectableZone, showcase }
 * showcase = carta gigante no centro da tela (ex.: Reviver se despedaçando), animada pelo CinematicPlayer.
 */
export class Canvas2DRenderer {
    /**
     * @param {import('../core/viewport.js').Viewport} viewport
     */
    constructor(canvasElement, cardPool, particleSystem, boardSystem, viewport, onResize) {
        this.canvas = canvasElement;
        this.ctx = canvasElement.getContext('2d', { alpha: true });
        this.pool = cardPool;
        this.particles = particleSystem;
        this.board = boardSystem;
        this.viewport = viewport;
        this.onResize = onResize;
        this.outlinePhase = 0;
        // Relógio dos efeitos animados de carta (segundos) e escala real de pixels do frame atual
        this.time = 0;
        this.pixelScale = 1;
        this.art = new CardArt();
        this.effects = new CardEffects();
        this.glowSprite = null;

        this.resize();
        viewport.onChange(() => this.resize());
    }

    /** Backbuffer em pixels físicos (nítido em telas de alta densidade); o jogo desenha em coordenadas virtuais. */
    resize() {
        const vp = this.viewport;
        this.canvas.width = Math.round(vp.cssWidth * vp.dpr);
        this.canvas.height = Math.round(vp.cssHeight * vp.dpr);
        this.canvas.style.width = `${vp.cssWidth}px`;
        this.canvas.style.height = `${vp.cssHeight}px`;
        this.board.resize(vp.width, vp.height, vp.scale * vp.dpr);
        if (this.onResize) this.onResize(vp.width, vp.height);
    }

    /**
     * @param {object} scene
     * @param {number} dt ms desde o último frame
     */
    draw(scene, dt) {
        const ctx = this.ctx;
        const pool = this.pool;
        const vp = this.viewport;
        const pixelScale = vp.scale * vp.dpr;
        this.pixelScale = pixelScale;
        this.time += dt / 1000;
        ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
        ctx.clearRect(0, 0, vp.width, vp.height);

        this.board.draw(ctx);
        this.drawDeckPile(scene);

        // Suavização independente de FPS (equivale a 0.4 por frame a 60fps)
        const k = 1 - Math.pow(CONFIG.ANIM.RENDER_SMOOTHING, dt / FRAME_MS);
        const width = CARD_DIMENSIONS.WIDTH;
        const height = CARD_DIMENSIONS.HEIGHT;
        this.outlinePhase = (this.outlinePhase + (dt / 1000) * OUTLINE.SPEED) % OUTLINE_PERIOD;

        pool.sortDrawOrder();
        const order = pool.drawOrder;
        for (let n = 0; n < pool.drawCount; n++) {
            const i = order[n];
            const drawX = pool.x[i] + (pool.targetX[i] - pool.x[i]) * k;
            const drawY = pool.y[i] + (pool.targetY[i] - pool.y[i]) * k;
            pool.x[i] = drawX;
            pool.y[i] = drawY;

            ctx.save();
            const zone = pool.zone[i];
            if (i === scene.hoveredCard) {
                ctx.shadowColor = '#00ffff';
                ctx.shadowBlur = 20;
            } else if (zone === scene.selectableZone) {
                ctx.shadowColor = '#ff3333';
                ctx.shadowBlur = 14;
            }

            ctx.translate(drawX + width / 2, drawY + pool.hoverOffsetY[i] + height / 2);
            if (pool.rotation[i] !== 0) ctx.rotate(pool.rotation[i]);
            if (pool.scale[i] !== 1) ctx.scale(pool.scale[i], pool.scale[i]);
            ctx.translate(-width / 2, -height / 2);

            if (pool.type[i] === CARD_TYPES.HIDDEN) this.drawBack(ctx);
            else this.drawFace(ctx, pool.type[i], pool.color[i], pool.power[i], i, pool.scale[i]);

            if (pool.outlined[i] === 1) this.drawPlayableOutline(ctx);

            ctx.restore();
        }

        if (scene.showcase) this.drawShowcase(scene.showcase);
        this.particles.draw(ctx);
    }

    /**
     * Desenha uma carta num contexto externo (ex.: as prévias da loja), com os mesmos ícones, faces
     * pintadas e efeitos animados do tabuleiro. `density` = px de device por unidade de carta.
     */
    drawCardInto(ctx, type, color, power, seed, density) {
        const saved = this.pixelScale;
        this.pixelScale = 1;
        if (type === CARD_TYPES.HIDDEN) this.drawBack(ctx);
        else this.drawFace(ctx, type, color, power, seed, density);
        this.pixelScale = saved;
    }

    /** Brilho radial dourado pré-rasterizado (atrás da carta gigante); criado uma única vez. */
    getGlowSprite() {
        if (this.glowSprite) return this.glowSprite;
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const g = canvas.getContext('2d');
        const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        grad.addColorStop(0, 'rgba(255, 250, 225, 0.95)');
        grad.addColorStop(0.25, 'rgba(255, 220, 120, 0.6)');
        grad.addColorStop(0.6, 'rgba(255, 180, 40, 0.18)');
        grad.addColorStop(1, 'rgba(255, 180, 40, 0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, size, size);
        this.glowSprite = canvas;
        return canvas;
    }

    /** Carta gigante no centro (escurece a mesa, brilho atrás, rachaduras antes de se despedaçar). */
    drawShowcase(sc) {
        if (sc.dim <= 0 && sc.glow <= 0 && sc.flash <= 0 && !sc.cardVisible) return;
        const ctx = this.ctx;
        const vp = this.viewport;
        const cx = vp.width / 2;
        const cy = vp.height / 2;
        const w = CARD_DIMENSIONS.WIDTH;
        const h = CARD_DIMENSIONS.HEIGHT;

        ctx.save();
        if (sc.dim > 0) {
            ctx.globalAlpha = sc.dim;
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, vp.width, vp.height);
        }
        if (sc.glow > 0) {
            const radius = h * Math.max(1, sc.scale) * 1.1;
            ctx.globalAlpha = sc.glow;
            ctx.globalCompositeOperation = 'lighter';
            ctx.drawImage(this.getGlowSprite(), cx - radius, cy - radius, radius * 2, radius * 2);
            ctx.globalCompositeOperation = 'source-over';
        }
        // Estouro do despedaçamento: clarão de luz + anel de choque se expandindo
        if (sc.flash > 0) {
            const f = sc.flash;
            const burst = h * (2.2 + (1 - f) * 2.5);
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = f;
            ctx.drawImage(this.getGlowSprite(), cx - burst, cy - burst, burst * 2, burst * 2);
            ctx.globalCompositeOperation = 'source-over';
            const ring = h * (0.4 + (1 - f) * 3.2);
            ctx.globalAlpha = f * 0.9;
            ctx.lineWidth = 3 + f * 10;
            ctx.strokeStyle = '#ffe9a3';
            ctx.beginPath();
            ctx.arc(cx, cy, ring, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = f * 0.6;
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(cx, cy, ring * 0.82, 0, Math.PI * 2);
            ctx.stroke();
        }
        if (sc.cardVisible) {
            ctx.globalAlpha = sc.alpha;
            ctx.translate(cx + sc.shakeX, cy + sc.shakeY);
            ctx.rotate(sc.rotation);
            ctx.scale(sc.scale, sc.scale);
            ctx.translate(-w / 2, -h / 2);
            this.drawFace(ctx, sc.type, sc.color, 0, 7, sc.scale);
            if (sc.crack > 0) this.drawCracks(ctx, sc.cracks, sc.crack);
        }
        ctx.restore();
    }

    /** Rachaduras crescendo do centro (halo dourado largo + fio branco fino, sem shadowBlur por frame). */
    drawCracks(ctx, cracks, progress) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let pass = 0; pass < 2; pass++) {
            ctx.strokeStyle = pass === 0 ? 'rgba(255, 190, 40, 0.55)' : '#ffffff';
            ctx.lineWidth = pass === 0 ? 3.2 : 1.1;
            for (let c = 0; c < cracks.length; c++) {
                const pts = cracks[c];
                const segments = (pts.length / 2) - 1;
                const shown = progress * segments;
                const whole = Math.floor(shown);
                ctx.beginPath();
                ctx.moveTo(pts[0], pts[1]);
                for (let s = 1; s <= whole; s++) ctx.lineTo(pts[s * 2], pts[s * 2 + 1]);
                if (whole < segments) {
                    const f = shown - whole;
                    const x0 = pts[whole * 2];
                    const y0 = pts[whole * 2 + 1];
                    ctx.lineTo(x0 + (pts[whole * 2 + 2] - x0) * f, y0 + (pts[whole * 2 + 3] - y0) * f);
                }
                ctx.stroke();
            }
        }
    }

    /** Traços que percorrem a borda em sentido horário (offset negativo avança no sentido do caminho do roundRect). */
    drawPlayableOutline(ctx) {
        ctx.shadowBlur = 0;
        ctx.setLineDash(OUTLINE_DASH);
        ctx.lineDashOffset = -this.outlinePhase;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.roundRect(OUTLINE_POS, OUTLINE_POS, OUTLINE_W, OUTLINE_H, OUTLINE_R);
        ctx.strokeStyle = OUTLINE.GLOW_COLOR;
        ctx.lineWidth = OUTLINE.GLOW_WIDTH;
        ctx.stroke();
        ctx.strokeStyle = OUTLINE.COLOR;
        ctx.lineWidth = OUTLINE.LINE_WIDTH;
        ctx.stroke();
    }

    drawDeckPile(scene) {
        if (scene.deckCount <= 0) return;
        const ctx = this.ctx;
        const layers = Math.min(DECK_PILE_MAX, Math.ceil(scene.deckCount / 20));
        for (let i = 0; i < layers; i++) {
            ctx.save();
            ctx.translate(scene.deckX - i * 2, scene.deckY - i * 2);
            this.drawBack(ctx);
            ctx.restore();
        }
        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = '16px Righteous';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(String(scene.deckCount), scene.deckX + CARD_DIMENSIONS.WIDTH / 2, scene.deckY + CARD_DIMENSIONS.HEIGHT + 6);
        ctx.restore();
    }

    drawBack(ctx) {
        const w = CARD_DIMENSIONS.WIDTH;
        const h = CARD_DIMENSIONS.HEIGHT;
        ctx.fillStyle = '#222';
        ctx.beginPath();
        ctx.roundRect(0, 0, w, h, CARD_DIMENSIONS.RADIUS);
        ctx.fill();
        ctx.strokeStyle = '#4a00e0';
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.fillStyle = '#4a00e0';
        ctx.font = '24px Righteous';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('YUGI', w / 2, h / 2 - 12);
        ctx.fillText('UNO', w / 2, h / 2 + 15);
    }

    /**
     * @param {number} seed id da carta (defasa efeitos animados entre cartas iguais)
     * @param {number} displayScale escala em que a carta aparece (define a resolução do cache pintado)
     */
    drawFace(ctx, type, color, power, seed = 0, displayScale = 1) {
        const w = CARD_DIMENSIONS.WIDTH;
        const h = CARD_DIMENSIONS.HEIGHT;
        const visual = CARD_VISUALS[type];

        if (visual) {
            this.drawStyledFace(ctx, type, visual, seed, displayScale);
            return;
        }

        ctx.fillStyle = COLOR_HEX[color] || COLOR_HEX[COLOR.NONE];
        ctx.beginPath();
        ctx.roundRect(0, 0, w, h, CARD_DIMENSIONS.RADIUS);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = COLOR_HEX[COLOR.RAINBOW];
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        switch (type) {
            case CARD_TYPES.PLUS4:
                ctx.font = '40px Righteous';
                ctx.fillText('+4', w / 2, h / 2);
                break;
            case CARD_TYPES.PLUS2:
                ctx.font = '40px Righteous';
                ctx.fillText('+2', w / 2, h / 2);
                break;
            case CARD_TYPES.BLOCK:
                ctx.lineWidth = 6;
                ctx.strokeStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(w / 2, h / 2, 25, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(w / 2 - 18, h / 2 - 18);
                ctx.lineTo(w / 2 + 18, h / 2 + 18);
                ctx.stroke();
                break;
            case CARD_TYPES.REVERSE:
                this.drawReverseIcon(ctx, w / 2, h / 2, 22);
                break;
            case CARD_TYPES.CHANGE_COLOR:
                this.drawColorWheel(ctx, w / 2, h / 2, 25);
                break;
            case CARD_TYPES.HEAL:
                drawHealIcon(ctx, w / 2, h / 2, 27);
                break;
            case CARD_TYPES.SHIELD:
                drawShieldIcon(ctx, w / 2, h / 2, 58);
                break;
            default: {
                const label = power >= 0 && power < NUMBER_LABELS.length ? power : 0;
                ctx.font = '50px Righteous';
                ctx.fillText(NUMBER_LABELS[label], w / 2, h / 2 - 10);
                ctx.font = '20px Righteous';
                ctx.fillText(HEART_LABELS[label], w - 30, h - 20);
            }
        }
    }

    /** Carta com visual próprio (CONFIG.CARD_VISUALS): face pintada em cache ou fundo sólido + efeito animado. */
    drawStyledFace(ctx, type, visual, seed, displayScale) {
        const w = CARD_DIMENSIONS.WIDTH;
        const h = CARD_DIMENSIONS.HEIGHT;
        const radius = CARD_DIMENSIONS.RADIUS;

        const painted = visual.painted ? this.art.paintedFace(type, this.pixelScale * displayScale) : null;
        if (painted) {
            ctx.drawImage(painted, 0, 0, w, h);
        } else {
            ctx.fillStyle = visual.background;
            ctx.beginPath();
            ctx.roundRect(0, 0, w, h, radius);
            ctx.fill();
        }

        if (visual.fx) {
            const shadow = ctx.shadowBlur;
            ctx.shadowBlur = 0;
            this.effects.draw(ctx, visual.fx, w, h, radius, this.time, seed);
            ctx.shadowBlur = shadow;
        }

        ctx.beginPath();
        ctx.roundRect(0, 0, w, h, radius);
        ctx.strokeStyle = visual.border || '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    drawColorWheel(ctx, cx, cy, r) {
        for (let q = 0; q < 4; q++) {
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, r, WHEEL_STARTS[q], WHEEL_STARTS[q] + Math.PI * 0.5);
            ctx.fillStyle = COLOR_HEX[WHEEL_COLORS[q]];
            ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
    }

    /**
     * Duas setas horizontais opostas (ícone do Reverso). Vetorial, não texto: o glifo de seta
     * usado antes (U+2B82) não existe nas fontes padrão de muitos celulares e caía no
     * "retângulo com traço" de glifo ausente. Path já é a solução do Block pro mesmo problema.
     */
    drawReverseIcon(ctx, cx, cy, size) {
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#ffffff';
        ctx.fillStyle = '#ffffff';
        const offsetY = size * 0.32;
        this.drawArrow(ctx, cx - size, cy - offsetY, cx + size, cy - offsetY, 15);
        this.drawArrow(ctx, cx + size, cy + offsetY, cx - size, cy + offsetY, 15);
    }

    /**
     * Segmento de reta com ponta triangular afiada em (x2,y2). A haste para um pouco antes do
     * vértice, senão a ponta arredondada dela (lineCap round) engorda o bico e o triângulo
     * some por baixo — assim a ponta afiada é só o triângulo, terminando exatamente em (x2,y2).
     */
    drawArrow(ctx, x1, y1, x2, y2, headLength) {
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const wingAngle = 0.4; // ~23°: ponta comprida e afiada, não um triângulo curto/largo
        const backX = x2 - headLength * 0.85 * Math.cos(angle);
        const backY = y2 - headLength * 0.85 * Math.sin(angle);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(backX, backY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - headLength * Math.cos(angle - wingAngle), y2 - headLength * Math.sin(angle - wingAngle));
        ctx.lineTo(x2 - headLength * Math.cos(angle + wingAngle), y2 - headLength * Math.sin(angle + wingAngle));
        ctx.closePath();
        ctx.fill();
    }
}
