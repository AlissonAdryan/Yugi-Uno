import { CONFIG } from '../config/constants.js';
import { BOARD_ZONES, ZONE } from '../utils/zones.js';

/**
 * BoardSystem - geometria dos slots do tabuleiro, sempre na perspectiva do jogador local
 * (SELF_* embaixo, OPP_* em cima). Chaveado pelas zonas relativas do protocolo.
 *
 * As bordas tracejadas e os rótulos "USE" são estáticos entre resizes (só a geometria dos
 * slots muda, e raramente). Setar `ctx.font`/`fillText` a cada frame é caro (força resolução
 * da fonte). Por isso esse conteúdo é rasterizado uma vez num canvas offscreen e só "colado"
 * (drawImage) nos frames seguintes; realce de arrasto e cadeado continuam ao vivo, pois mudam de fato.
 */
export class BoardSystem {
    constructor() {
        this.slots = [];
        for (let z = 0; z < 10; z++) this.slots.push(null);
        this.locked = new Uint8Array(10);
        this.highlightZone = -1;

        this.viewWidth = 0;
        this.viewHeight = 0;
        this.cachePixelScale = 1;
        this.cacheDirty = true;
        this.cacheCanvas = document.createElement('canvas');
        this.cacheCtx = this.cacheCanvas.getContext('2d');
    }

    /** @param {number} pixelScale vp.scale * vp.dpr — resolução do cache bate 1:1 com o backbuffer real */
    resize(width, height, pixelScale = this.cachePixelScale) {
        const cw = CONFIG.CARD_DIMENSIONS.WIDTH;
        const ch = CONFIG.CARD_DIMENSIONS.HEIGHT;
        const cx = width / 2;
        const cy = height / 2;
        const gap = 20;

        this.slots[ZONE.SELF_ATTACK] = this.makeSlot(cx - cw / 2, cy + gap, 0);
        this.slots[ZONE.SELF_DEFENSE] = this.makeSlot(cx - cw / 2, cy + gap + ch + gap + cw / 2 - ch / 2, Math.PI / 2);
        this.slots[ZONE.SELF_USE] = this.makeSlot(cx + ch + gap, cy + gap, 0, 'USE');

        this.slots[ZONE.OPP_ATTACK] = this.makeSlot(cx - cw / 2, cy - gap - ch, 0);
        this.slots[ZONE.OPP_DEFENSE] = this.makeSlot(cx - cw / 2, cy - gap - ch - gap - cw / 2 - ch / 2, Math.PI / 2);
        this.slots[ZONE.OPP_USE] = this.makeSlot(cx + ch + gap, cy - gap - ch, 0, 'USE');

        this.viewWidth = width;
        this.viewHeight = height;
        this.cachePixelScale = pixelScale;
        this.cacheDirty = true;
    }

    /** x/y: canto da carta sem rotação; hit*: retângulo visual já rotacionado. */
    makeSlot(x, y, rotation, label = null) {
        const cw = CONFIG.CARD_DIMENSIONS.WIDTH;
        const ch = CONFIG.CARD_DIMENSIONS.HEIGHT;
        const rotated = rotation !== 0;
        const hitW = rotated ? ch : cw;
        const hitH = rotated ? cw : ch;
        const centerX = x + cw / 2;
        const centerY = y + ch / 2;
        return {
            x, y, width: cw, height: ch, rotation, label,
            hitX: centerX - hitW / 2, hitY: centerY - hitH / 2, hitW, hitH
        };
    }

    /** @returns {number} zona relativa sob o ponto, ou -1 */
    getZoneAt(x, y) {
        for (let i = 0; i < BOARD_ZONES.length; i++) {
            const zone = BOARD_ZONES[i];
            const r = this.slots[zone];
            if (r && x >= r.hitX && x <= r.hitX + r.hitW && y >= r.hitY && y <= r.hitY + r.hitH) return zone;
        }
        return -1;
    }

    setLocked(zone, isLocked) {
        this.locked[zone] = isLocked ? 1 : 0;
    }

    draw(ctx) {
        if (this.cacheDirty) this.rebuildCache();

        // Cache já está em pixels de device 1:1 com o backbuffer: blita fora da transform virtual corrente
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(this.cacheCanvas, 0, 0);
        ctx.restore();

        this.drawDynamic(ctx);
    }

    /** Bordas tracejadas + rótulos "USE": só muda quando o tabuleiro redimensiona. */
    rebuildCache() {
        this.cacheDirty = false;
        const scale = this.cachePixelScale;
        this.cacheCanvas.width = Math.max(1, Math.round(this.viewWidth * scale));
        this.cacheCanvas.height = Math.max(1, Math.round(this.viewHeight * scale));

        const ctx = this.cacheCtx;
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.clearRect(0, 0, this.viewWidth, this.viewHeight);
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = '20px Righteous';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let i = 0; i < BOARD_ZONES.length; i++) {
            const r = this.slots[BOARD_ZONES[i]];
            if (!r) continue;
            ctx.beginPath();
            ctx.roundRect(r.hitX, r.hitY, r.hitW, r.hitH, CONFIG.CARD_DIMENSIONS.RADIUS);
            ctx.stroke();
            if (r.label) ctx.fillText(r.label, r.hitX + r.hitW / 2, r.hitY + r.hitH / 2);
        }
    }

    /** Realce da zona sob arrasto e cadeado de bloqueio: mudam quadro a quadro, ficam fora do cache. */
    drawDynamic(ctx) {
        if (this.highlightZone !== -1) {
            const r = this.slots[this.highlightZone];
            if (r) {
                ctx.save();
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 5]);
                ctx.strokeStyle = 'rgba(0, 255, 255, 0.9)';
                ctx.beginPath();
                ctx.roundRect(r.hitX, r.hitY, r.hitW, r.hitH, CONFIG.CARD_DIMENSIONS.RADIUS);
                ctx.stroke();
                ctx.restore();
            }
        }

        for (let i = 0; i < BOARD_ZONES.length; i++) {
            const zone = BOARD_ZONES[i];
            if (!this.locked[zone]) continue;
            const r = this.slots[zone];
            if (r) this.drawLock(ctx, r.hitX + r.hitW / 2, r.hitY + r.hitH / 2);
        }
    }

    drawLock(ctx, cx, cy) {
        ctx.save();
        ctx.setLineDash([]);
        ctx.lineWidth = 8;
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.6)';
        ctx.beginPath();
        ctx.arc(cx, cy, 30, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - 21, cy - 21);
        ctx.lineTo(cx + 21, cy + 21);
        ctx.stroke();
        ctx.restore();
    }
}
