import { CONFIG } from '../config/constants.js';

const { CARD_TYPES, CARD_DIMENSIONS } = CONFIG;
const TAU = Math.PI * 2;
const W = CARD_DIMENSIONS.WIDTH;
const H = CARD_DIMENSIONS.HEIGHT;
const R = CARD_DIMENSIONS.RADIUS;
// Resolução máxima do cache de face pintada (px de device por unidade virtual): a carta gigante do
// Reviver chega a ~2.3x de escala em tela de alta densidade; acima disso não há ganho visível.
const MAX_CACHE_SCALE = 6;
const MIN_CACHE_SCALE = 2;

/**
 * Ícones vetoriais das cartas (100% procedurais: nítidos em qualquer escala, sem arquivo de imagem)
 * e faces "pintadas" — cartas ricas em gradientes que são desenhadas uma única vez num canvas de cache
 * e depois só coladas (drawImage) a cada frame, sem alocar gradiente nenhum no loop (Pilar 1).
 */

/** Cruz de cura em contorno (o "+" clássico de cantos arredondados), branca sobre o fundo preto. */
export function drawHealIcon(ctx, cx, cy, size) {
    const e = size;
    const a = size * 0.36;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.moveTo(-a, -e); ctx.lineTo(a, -e); ctx.lineTo(a, -a); ctx.lineTo(e, -a);
    ctx.lineTo(e, a); ctx.lineTo(a, a); ctx.lineTo(a, e); ctx.lineTo(-a, e);
    ctx.lineTo(-a, a); ctx.lineTo(-e, a); ctx.lineTo(-e, -a); ctx.lineTo(-a, -a);
    ctx.closePath();
    ctx.fillStyle = 'rgba(46, 204, 113, 0.22)';
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.restore();
}

/** Contorno de escudo "heater": topo em bico suave, laterais retas curvando até a ponta de baixo. */
function shieldPath(ctx, k, offsetY) {
    ctx.beginPath();
    ctx.moveTo(-0.5 * k, -0.36 * k + offsetY);
    ctx.lineTo(0, -0.5 * k + offsetY);
    ctx.lineTo(0.5 * k, -0.36 * k + offsetY);
    ctx.bezierCurveTo(0.5 * k, 0.12 * k + offsetY, 0.34 * k, 0.42 * k + offsetY, 0, 0.58 * k + offsetY);
    ctx.bezierCurveTo(-0.34 * k, 0.42 * k + offsetY, -0.5 * k, 0.12 * k + offsetY, -0.5 * k, -0.36 * k + offsetY);
    ctx.closePath();
}

/**
 * Escudo todo branco: contorno grosso por fora e, por dentro, só a metade direita preenchida
 * (a esquerda fica vazada), separadas por um vão no meio — o mesmo desenho do ícone de referência.
 * @param {number} size largura total do escudo
 */
export function drawShieldIcon(ctx, cx, cy, size) {
    const k = size;
    ctx.save();
    ctx.translate(cx, cy - 0.04 * k);
    shieldPath(ctx, k, 0);
    ctx.lineJoin = 'round';
    ctx.lineWidth = k * 0.09;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.beginPath();
    ctx.rect(k * 0.035, -k, k, 2 * k);
    ctx.clip();
    shieldPath(ctx, k * 0.72, k * 0.03);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
}

/** Pena/folha entre (x0,y0) e (x1,y1); `width` é o bojo (assimétrico, pra parecer pena de asa). */
function featherPath(ctx, x0, y0, x1, y1, width) {
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    const nx = -(y1 - y0) / len;
    const ny = (x1 - x0) / len;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(mx + nx * width, my + ny * width, x1, y1);
    ctx.quadraticCurveTo(mx - nx * width * 0.55, my - ny * width * 0.55, x0, y0);
    ctx.closePath();
}

function heartPath(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.42);
    ctx.bezierCurveTo(x - s * 0.62, y + s * 0.02, x - s * 0.42, y - s * 0.52, x, y - s * 0.18);
    ctx.bezierCurveTo(x + s * 0.42, y - s * 0.52, x + s * 0.62, y + s * 0.02, x, y + s * 0.42);
    ctx.closePath();
}

/** Emblema do Reviver: coração dourado alado sob uma auréola. `s` ~ meia-largura das asas. */
function drawReviveEmblem(ctx, cx, cy, s) {
    const gold = ctx.createLinearGradient(cx - s, cy - s, cx + s, cy + s);
    gold.addColorStop(0, '#fff7c9');
    gold.addColorStop(0.35, '#f7d154');
    gold.addColorStop(0.7, '#d9a21b');
    gold.addColorStop(1, '#a8740c');
    const outline = '#8a5d07';

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Asas (penas de baixo pra cima, a de cima por último pra sobrepor)
    const rootY = cy - s * 0.04;
    for (let side = -1; side <= 1; side += 2) {
        const rootX = cx + side * s * 0.24;
        const feathers = [
            [cx + side * s * 0.74, cy + s * 0.14, s * 0.1],
            [cx + side * s * 0.93, cy - s * 0.17, s * 0.12],
            [cx + side * s * 0.99, cy - s * 0.5, s * 0.13]
        ];
        for (let i = 0; i < feathers.length; i++) {
            const [fx, fy, fw] = feathers[i];
            featherPath(ctx, rootX, rootY, fx, fy, fw * -side);
            ctx.fillStyle = gold;
            ctx.fill();
            ctx.lineWidth = s * 0.035;
            ctx.strokeStyle = outline;
            ctx.stroke();
            // Haste da pena (clarinha)
            ctx.beginPath();
            ctx.moveTo(rootX, rootY);
            ctx.lineTo(rootX + (fx - rootX) * 0.8, rootY + (fy - rootY) * 0.8);
            ctx.lineWidth = s * 0.018;
            ctx.strokeStyle = 'rgba(255, 248, 210, 0.85)';
            ctx.stroke();
        }
    }

    // Coração com brilho
    const hs = s * 0.8;
    const hy = cy + s * 0.06;
    ctx.shadowColor = 'rgba(255, 196, 40, 0.9)';
    ctx.shadowBlur = s * 0.35;
    heartPath(ctx, cx, hy, hs);
    ctx.fillStyle = gold;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = s * 0.045;
    ctx.strokeStyle = outline;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx - hs * 0.2, hy - hs * 0.2, hs * 0.1, hs * 0.06, -0.6, 0, TAU);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fill();

    // Auréola
    const haloY = cy - s * 0.62;
    ctx.beginPath();
    ctx.ellipse(cx, haloY, s * 0.34, s * 0.095, 0, 0, TAU);
    ctx.shadowColor = 'rgba(255, 215, 0, 1)';
    ctx.shadowBlur = s * 0.3;
    ctx.lineWidth = s * 0.075;
    ctx.strokeStyle = '#f5c542';
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineWidth = s * 0.025;
    ctx.strokeStyle = '#fff6c8';
    ctx.stroke();
    ctx.restore();
}

function drawDiamond(ctx, x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.7, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r * 0.7, y);
    ctx.closePath();
    ctx.fill();
}

/** Face estática do Reviver em coordenadas de carta (100x150): branco perolado, moldura e emblema dourados. */
function paintReviveFace(ctx) {
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, R);
    ctx.clip();

    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#ffffff');
    bg.addColorStop(0.5, '#fdf8ea');
    bg.addColorStop(1, '#f1dfae');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Raios de sol bem sutis atrás do emblema
    const cx = W / 2;
    const cy = H * 0.5;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = 'rgba(212, 175, 55, 0.13)';
    const rays = 18;
    for (let i = 0; i < rays; i++) {
        ctx.rotate(TAU / rays);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-3, -H);
        ctx.lineTo(3, -H);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();

    const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, W * 0.6);
    glow.addColorStop(0, 'rgba(255, 236, 160, 0.8)');
    glow.addColorStop(0.5, 'rgba(255, 236, 160, 0.25)');
    glow.addColorStop(1, 'rgba(255, 236, 160, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // Moldura dourada dupla
    const frame = ctx.createLinearGradient(0, 0, W, H);
    frame.addColorStop(0, '#b8860b');
    frame.addColorStop(0.25, '#ffe680');
    frame.addColorStop(0.5, '#c9971c');
    frame.addColorStop(0.75, '#fff2a8');
    frame.addColorStop(1, '#a87b12');
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = frame;
    ctx.beginPath();
    ctx.roundRect(5, 5, W - 10, H - 10, R - 3);
    ctx.stroke();
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = 'rgba(201, 151, 28, 0.85)';
    ctx.beginPath();
    ctx.roundRect(9, 9, W - 18, H - 18, R - 5);
    ctx.stroke();

    // Ornamentos nos cantos e no meio das laterais
    ctx.fillStyle = '#d4a52a';
    drawDiamond(ctx, 13, 13, 3.2);
    drawDiamond(ctx, W - 13, 13, 3.2);
    drawDiamond(ctx, 13, H - 13, 3.2);
    drawDiamond(ctx, W - 13, H - 13, 3.2);
    drawDiamond(ctx, W / 2, 9, 2.4);
    drawDiamond(ctx, W / 2, H - 9, 2.4);

    drawReviveEmblem(ctx, cx, cy + 4, 40);
}

/** Face estática do Pintar: fundo preto profundo com paleta de pintura em néon e aura misteriosa. */
function paintPaintFace(ctx) {
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, R);
    ctx.clip();

    // Fundo preto com gradiente sutil de profundidade
    const bg = ctx.createRadialGradient(W / 2, H * 0.45, 5, W / 2, H * 0.45, W * 0.8);
    bg.addColorStop(0, '#1a1a2e');
    bg.addColorStop(0.5, '#111122');
    bg.addColorStop(1, '#050510');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Aura mística atrás da paleta
    const aura = ctx.createRadialGradient(W / 2, H * 0.48, 2, W / 2, H * 0.48, W * 0.55);
    aura.addColorStop(0, 'rgba(123, 104, 238, 0.35)');
    aura.addColorStop(0.5, 'rgba(123, 104, 238, 0.1)');
    aura.addColorStop(1, 'rgba(123, 104, 238, 0)');
    ctx.fillStyle = aura;
    ctx.fillRect(0, 0, W, H);

    const cx = W / 2;
    const cy = H * 0.48;

    // Paleta (forma oval inclinada)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.15);
    ctx.beginPath();
    ctx.ellipse(0, 0, 32, 25, 0, 0, TAU);
    const palGrad = ctx.createLinearGradient(-32, -25, 32, 25);
    palGrad.addColorStop(0, '#2a2a3a');
    palGrad.addColorStop(0.5, '#1e1e2e');
    palGrad.addColorStop(1, '#151520');
    ctx.fillStyle = palGrad;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#7b68ee';
    ctx.stroke();

    // Buraco da paleta (polegar)
    ctx.beginPath();
    ctx.ellipse(-14, 8, 5, 4, 0.3, 0, TAU);
    ctx.fillStyle = '#050510';
    ctx.fill();
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = '#5b4eae';
    ctx.stroke();

    // Gotas de tinta (4 cores do jogo)
    const droplets = [
        { x: 8, y: -14, color: '#e74c3c' },
        { x: 20, y: -6, color: '#3498db' },
        { x: 16, y: 8, color: '#2ecc71' },
        { x: -2, y: -6, color: '#ffcc00' }
    ];
    for (const d of droplets) {
        ctx.beginPath();
        ctx.arc(d.x, d.y, 4.5, 0, TAU);
        const dGrad = ctx.createRadialGradient(d.x - 1, d.y - 1, 0.5, d.x, d.y, 4.5);
        dGrad.addColorStop(0, '#ffffff');
        dGrad.addColorStop(0.3, d.color);
        dGrad.addColorStop(1, d.color);
        ctx.fillStyle = dGrad;
        ctx.fill();
        ctx.shadowColor = d.color;
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;
    }
    ctx.restore();

    // Pincel sobre a paleta (diagonal)
    ctx.save();
    ctx.translate(cx + 18, cy - 22);
    ctx.rotate(0.7);
    // Cabo
    const handleGrad = ctx.createLinearGradient(0, -28, 0, -4);
    handleGrad.addColorStop(0, '#c9a857');
    handleGrad.addColorStop(0.5, '#a8860b');
    handleGrad.addColorStop(1, '#7a6109');
    ctx.fillStyle = handleGrad;
    ctx.beginPath();
    ctx.roundRect(-2.5, -28, 5, 24, 1.5);
    ctx.fill();
    // Ferrule (faixa metálica)
    ctx.fillStyle = '#b0b0b0';
    ctx.fillRect(-3, -5, 6, 5);
    // Cerdas
    const bristleGrad = ctx.createLinearGradient(0, 0, 0, 12);
    bristleGrad.addColorStop(0, '#ddd');
    bristleGrad.addColorStop(0.6, '#9b59b6');
    bristleGrad.addColorStop(1, '#7b68ee');
    ctx.fillStyle = bristleGrad;
    ctx.beginPath();
    ctx.moveTo(-3.5, 0);
    ctx.lineTo(-2, 12);
    ctx.quadraticCurveTo(0, 14, 2, 12);
    ctx.lineTo(3.5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Moldura dupla
    const frame = ctx.createLinearGradient(0, 0, W, H);
    frame.addColorStop(0, '#5b4eae');
    frame.addColorStop(0.4, '#9b84ff');
    frame.addColorStop(0.6, '#7b68ee');
    frame.addColorStop(1, '#4a3d8f');
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = frame;
    ctx.beginPath();
    ctx.roundRect(5, 5, W - 10, H - 10, R - 3);
    ctx.stroke();
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = 'rgba(155, 132, 255, 0.5)';
    ctx.beginPath();
    ctx.roundRect(9, 9, W - 18, H - 18, R - 5);
    ctx.stroke();

    // Ornamentos nos cantos
    ctx.fillStyle = '#7b68ee';
    drawDiamond(ctx, 13, 13, 3.2);
    drawDiamond(ctx, W - 13, 13, 3.2);
    drawDiamond(ctx, 13, H - 13, 3.2);
    drawDiamond(ctx, W - 13, H - 13, 3.2);
    drawDiamond(ctx, W / 2, 9, 2.4);
    drawDiamond(ctx, W / 2, H - 9, 2.4);
}

const PAINTERS = Object.freeze({
    [CARD_TYPES.REVIVE]: paintReviveFace,
    [CARD_TYPES.PAINT]: paintPaintFace
});

/**
 * Cache de faces pintadas por tipo. A resolução do cache acompanha a maior escala já pedida
 * (a carta na mão pede ~2x; a carta gigante no centro pede até ~6x) e só é refeita quando precisa crescer.
 */
export class CardArt {
    constructor() {
        /** @type {Map<number, { canvas: HTMLCanvasElement, scale: number }>} */
        this.cache = new Map();
    }

    hasPainter(type) {
        return PAINTERS[type] !== undefined;
    }

    /**
     * @param {number} type CARD_TYPES.*
     * @param {number} neededScale px de device por unidade virtual onde a carta vai aparecer
     * @returns {HTMLCanvasElement|null}
     */
    paintedFace(type, neededScale) {
        const painter = PAINTERS[type];
        if (!painter) return null;
        const scale = Math.min(MAX_CACHE_SCALE, Math.max(MIN_CACHE_SCALE, Math.ceil(neededScale)));
        const cached = this.cache.get(type);
        if (cached && cached.scale >= scale) return cached.canvas;

        const canvas = cached ? cached.canvas : document.createElement('canvas');
        canvas.width = Math.ceil(W * scale);
        canvas.height = Math.ceil(H * scale);
        const ctx = canvas.getContext('2d');
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.clearRect(0, 0, W, H);
        ctx.save();
        painter(ctx);
        ctx.restore();
        this.cache.set(type, { canvas, scale });
        console.log(`[CardArt] Face do tipo ${type} pintada em cache (${scale}x).`);
        return canvas;
    }
}
