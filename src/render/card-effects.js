const TAU = Math.PI * 2;

/**
 * Efeitos visuais animados sobrepostos à face de uma carta (laminado, holográfico, ...).
 *
 * Como adicionar um efeito novo:
 *   1. Crie um preset em FX_PRESETS (faixas de brilho + faíscas) ou um `draw` próprio.
 *   2. Aponte `fx: 'NOME'` em CONFIG.CARD_VISUALS para o tipo de carta que deve usá-lo.
 * Nada mais no renderer precisa mudar.
 *
 * Desempenho (Pilar 1/2): todo gradiente é rasterizado UMA vez em sprites pequenos na compilação do
 * preset; por frame, cada carta só faz alguns drawImage + caminhos curtos — zero alocação no loop.
 */

/**
 * @typedef {Object} FoilBand
 * @property {Array<[number, string]>} stops  gradiente horizontal da faixa (0..1)
 * @property {number} width      largura da faixa, fração da diagonal da carta
 * @property {number} period     segundos de um ciclo completo (varredura + pausa)
 * @property {number} sweep      fração do ciclo em que a faixa atravessa a carta (resto = pausa)
 * @property {number} alpha
 * @property {GlobalCompositeOperation} composite
 * @property {number} [offset]   defasagem 0..1 dentro do ciclo
 *
 * @typedef {Object} FoilPreset
 * @property {number} angle      inclinação das faixas (rad)
 * @property {FoilBand[]} bands
 * @property {{ count: number, color: string, core?: string, minSize: number, maxSize: number,
 *              minRate: number, maxRate: number }} [sparkles]
 */

/** @type {Record<string, FoilPreset>} */
const FX_PRESETS = {
    // Carta branca com laminado dourado: um véu dourado varre a carta e um reflexo estreito acende as partes em ouro
    FOIL_GOLD: {
        angle: -0.5,
        bands: [
            {
                stops: [[0, 'rgba(255,196,60,0)'], [0.5, 'rgba(255,196,60,0.34)'], [1, 'rgba(255,196,60,0)']],
                width: 0.7, period: 2.8, sweep: 0.75, alpha: 1, composite: 'source-over', offset: 0.35
            },
            {
                stops: [
                    [0, 'rgba(255,215,90,0)'], [0.35, 'rgba(255,215,110,0.45)'], [0.5, 'rgba(255,255,235,0.95)'],
                    [0.65, 'rgba(255,205,80,0.45)'], [1, 'rgba(255,215,90,0)']
                ],
                width: 0.26, period: 1.8, sweep: 0.5, alpha: 0.9, composite: 'lighter'
            }
        ],
        sparkles: {
            count: 9, color: '#f2b91d', core: '#fffbe6', minSize: 2.2, maxSize: 4.6, minRate: 3.2, maxRate: 6.4
        }
    },
    // Holográfico arco-íris (pronto para cartas futuras de fundo escuro)
    FOIL_HOLO: {
        angle: 0.6,
        bands: [
            {
                stops: [
                    [0, 'rgba(255,0,128,0)'], [0.2, 'rgba(255,60,160,0.25)'], [0.4, 'rgba(80,160,255,0.28)'],
                    [0.6, 'rgba(60,255,180,0.28)'], [0.8, 'rgba(255,230,80,0.25)'], [1, 'rgba(255,230,80,0)']
                ],
                width: 0.9, period: 5, sweep: 0.8, alpha: 1, composite: 'lighter'
            },
            {
                stops: [[0, 'rgba(255,255,255,0)'], [0.5, 'rgba(255,255,255,0.7)'], [1, 'rgba(255,255,255,0)']],
                width: 0.18, period: 2.8, sweep: 0.45, alpha: 0.8, composite: 'lighter', offset: 0.2
            }
        ],
        sparkles: { count: 7, color: '#ffffff', minSize: 1.8, maxSize: 3.6, minRate: 2, maxRate: 3.6 }
    }
};

export const CARD_FX_NAMES = Object.freeze(Object.keys(FX_PRESETS));

function makeBandSprite(stops) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 2;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
    for (let i = 0; i < stops.length; i++) grad.addColorStop(stops[i][0], stops[i][1]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvas;
}

/** Gerador determinístico (mesma posição de faíscas em toda sessão, sem depender de Math.random). */
function lcg(seed) {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

/** Brilho de 4 pontas côncavas (estrela de laminado). */
function sparklePath(ctx, x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.closePath();
}

function compile(name, preset) {
    const bands = preset.bands.map((b) => ({
        sprite: makeBandSprite(b.stops),
        width: b.width, period: b.period, sweep: b.sweep, alpha: b.alpha,
        composite: b.composite, offset: b.offset || 0
    }));

    const sp = preset.sparkles;
    const count = sp ? sp.count : 0;
    const rand = lcg(name.length * 7919 + count * 104729);
    const sparkleX = new Float32Array(count);
    const sparkleY = new Float32Array(count);
    const sparkleSize = new Float32Array(count);
    const sparkleRate = new Float32Array(count);
    const sparklePhase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        sparkleX[i] = 0.12 + rand() * 0.76;
        sparkleY[i] = 0.08 + rand() * 0.84;
        sparkleSize[i] = sp.minSize + rand() * (sp.maxSize - sp.minSize);
        sparkleRate[i] = sp.minRate + rand() * (sp.maxRate - sp.minRate);
        sparklePhase[i] = rand() * TAU;
    }

    return {
        angle: preset.angle, bands, count,
        sparkleX, sparkleY, sparkleSize, sparkleRate, sparklePhase,
        sparkleColor: sp ? sp.color : '#ffffff',
        sparkleCore: sp && sp.core ? sp.core : null
    };
}

export class CardEffects {
    constructor() {
        /** @type {Map<string, ReturnType<typeof compile>>} */
        this.compiled = new Map();
    }

    /** Presets são compilados sob demanda (só custam memória se alguma carta com o efeito aparecer). */
    get(name) {
        let fx = this.compiled.get(name);
        if (fx) return fx;
        const preset = FX_PRESETS[name];
        if (!preset) {
            console.warn(`[CardEffects] Efeito desconhecido: "${name}".`);
            this.compiled.set(name, null);
            return null;
        }
        fx = compile(name, preset);
        this.compiled.set(name, fx);
        return fx;
    }

    /**
     * Desenha o efeito sobre uma face já desenhada em (0,0,w,h).
     * @param {CanvasRenderingContext2D} ctx
     * @param {string} name chave de FX_PRESETS
     * @param {number} time segundos (relógio global de animação)
     * @param {number} seed id da carta: defasa a animação para cartas iguais não piscarem em sincronia
     */
    draw(ctx, name, w, h, radius, time, seed) {
        const fx = this.get(name);
        if (!fx) return;
        const diag = Math.sqrt(w * w + h * h);
        const phase = (seed * 0.6180339887) % 1;

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(0, 0, w, h, radius);
        ctx.clip();

        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.rotate(fx.angle);
        for (let i = 0; i < fx.bands.length; i++) {
            const band = fx.bands[i];
            let u = time / band.period + phase + band.offset;
            u -= Math.floor(u);
            if (u > band.sweep) continue;
            const bw = diag * band.width;
            const x = -diag / 2 - bw + (u / band.sweep) * (diag + bw);
            ctx.globalAlpha = band.alpha;
            ctx.globalCompositeOperation = band.composite;
            ctx.drawImage(band.sprite, x, -diag / 2, bw, diag);
        }
        ctx.restore();

        ctx.globalCompositeOperation = 'source-over';
        for (let i = 0; i < fx.count; i++) {
            let a = Math.sin(time * fx.sparkleRate[i] + fx.sparklePhase[i] + phase * TAU);
            if (a <= 0) continue;
            a = a * a * a;
            const x = fx.sparkleX[i] * w;
            const y = fx.sparkleY[i] * h;
            const r = fx.sparkleSize[i] * (0.45 + 0.55 * a);
            ctx.globalAlpha = a;
            ctx.fillStyle = fx.sparkleColor;
            sparklePath(ctx, x, y, r);
            ctx.fill();
            if (fx.sparkleCore) {
                ctx.fillStyle = fx.sparkleCore;
                sparklePath(ctx, x, y, r * 0.45);
                ctx.fill();
            }
        }
        ctx.restore();
    }
}
