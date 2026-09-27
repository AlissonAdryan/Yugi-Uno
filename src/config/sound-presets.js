import { CONFIG } from './constants.js';

const { BUS } = CONFIG.AUDIO;

/**
 * Biblioteca de sons sintetizados em tempo real (dados puros, sem arquivos).
 * Formato documentado em src/audio/synth.js (SoundSpec). Frequências aceitam Hz ou nota ("A4", "C#5", "Eb3").
 * Qualquer som pode ser tocado curto/médio/longo e transposto: audio.play(SFX.CLASH, { length: 'LONG', pitch: -3 }).
 * Para um som novo basta adicionar uma entrada aqui; ele vira SFX.NOME automaticamente.
 */
export const SOUND_PRESETS = Object.freeze({
    // --- Interface ------------------------------------------------------------
    CLICK: {
        bus: BUS.UI, duration: 0.06, volume: 0.6, cooldown: 0.03, pitchJitter: 0.6,
        envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.015 },
        layers: [
            { kind: 'tone', wave: 'triangle', freq: 1800, freqEnd: 900, sweepTime: 0.04 },
            { kind: 'noise', color: 'white', gain: 0.35, duration: 0.02, filter: { type: 'highpass', freq: 3500 } }
        ]
    },
    HOVER: {
        bus: BUS.UI, duration: 0.05, volume: 0.1, cooldown: 0.05, pitchJitter: 0.4,
        envelope: { attack: 0.004, decay: 0.03, sustain: 0.2, release: 0.015 },
        layers: [{ kind: 'tone', wave: 'sine', freq: 2200, freqEnd: 2600 }]
    },
    CONFIRM: {
        bus: BUS.UI, duration: 0.12, volume: 0.1,
        envelope: { attack: 0.004, decay: 0.06, sustain: 0.4, release: 0.05 },
        layers: [
            { kind: 'tone', wave: 'triangle', freq: 'E5' },
            { kind: 'tone', wave: 'sine', freq: 'E6', gain: 0.3 }
        ],
        notes: [{ at: 0, semitones: 0 }, { at: 0.09, semitones: 7 }],
        echo: { delay: 0.11, feedback: 0.25, mix: 0.2 }
    },
    ERROR: {
        bus: BUS.UI, duration: 0.22, volume: 0.1, cooldown: 0.1,
        envelope: { attack: 0.003, decay: 0.05, sustain: 0.7, release: 0.06 },
        filter: { type: 'lowpass', freq: 1400, q: 0.8 },
        layers: [
            { kind: 'tone', wave: 'square', freq: 170, freqEnd: 140, tremolo: { rate: 28, depth: 0.45 } },
            { kind: 'tone', wave: 'sawtooth', freq: 174, gain: 0.5 }
        ]
    },

    // --- Cartas ---------------------------------------------------------------
    CARD_DRAW: {
        duration: 0.2, volume: 0.3, pitchJitter: 1.5,
        envelope: { attack: 0.03, decay: 0.1, sustain: 0.3, release: 0.06 },
        layers: [
            { kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 700, freqEnd: 3200, q: 1.2 } },
            { kind: 'tone', wave: 'sine', freq: 420, freqEnd: 900, gain: 0.15 }
        ]
    },
    CARD_PLACE: {
        duration: 0.14, volume: 0.1, pitchJitter: 1,
        envelope: { attack: 0.001, decay: 0.11, sustain: 0, release: 0.02 },
        layers: [
            { kind: 'tone', wave: 'sine', freq: 170, freqEnd: 60 },
            { kind: 'noise', color: 'brown', gain: 0.6, duration: 0.06, filter: { type: 'lowpass', freq: 900 } },
            { kind: 'noise', color: 'white', gain: 0.25, duration: 0.015, filter: { type: 'highpass', freq: 4000 } }
        ]
    },
    CARD_FLIP: {
        duration: 0.07, volume: 0.1, pitchJitter: 2,
        envelope: { attack: 0.002, decay: 0.05, sustain: 0, release: 0.015 },
        layers: [
            { kind: 'noise', color: 'white', filter: { type: 'bandpass', freq: 2600, q: 1.6 } },
            { kind: 'tone', wave: 'triangle', freq: 1200, freqEnd: 2100, gain: 0.2 }
        ]
    },
    SHUFFLE: {
        duration: 0.05, volume: 0.1,
        envelope: { attack: 0.002, decay: 0.04, sustain: 0, release: 0.01 },
        layers: [{ kind: 'noise', color: 'white', filter: { type: 'bandpass', freq: 2200, q: 1.4 } }],
        sequence: { step: 0.045, semitones: [0, 2, -1, 3, 1, 4, 0, 5, 2, 6] }
    },
    REVEAL: {
        duration: 0.5, volume: 0.05,
        envelope: { attack: 0.005, decay: 0.2, sustain: 0.3, release: 0.25 },
        layers: [
            { kind: 'fm', freq: 'E6', modRatio: 3.5, modIndex: 2.5, modIndexEnd: 0.2 },
            { kind: 'tone', wave: 'sine', freq: 'B6', gain: 0.35, delay: 0.04, tremolo: { rate: 14, depth: 0.4 } }
        ],
        echo: { delay: 0.12, feedback: 0.35, mix: 0.3 }
    },

    // --- Combate --------------------------------------------------------------
    CLASH: {
        duration: 0.4, volume: 0.1, pitchJitter: 0.8, distortion: 0.25,
        envelope: { attack: 0.001, decay: 0.18, sustain: 0.15, release: 0.18 },
        layers: [
            { kind: 'noise', color: 'white', gain: 0.7, duration: 0.25, filter: { type: 'lowpass', freq: 7000, freqEnd: 500 } },
            { kind: 'tone', wave: 'sine', freq: 190, freqEnd: 45, sweepTime: 0.3 },
            { kind: 'tone', wave: 'square', freq: 95, freqEnd: 40, gain: 0.2, duration: 0.15 }
        ]
    },
    TIE: {
        duration: 0.3, volume: 0.1, distortion: 0.2,
        envelope: { attack: 0.001, decay: 0.15, sustain: 0.1, release: 0.12 },
        layers: [
            { kind: 'noise', color: 'white', gain: 0.6, duration: 0.2, filter: { type: 'lowpass', freq: 5000, freqEnd: 600 } },
            { kind: 'tone', wave: 'sine', freq: 160, freqEnd: 50 }
        ],
        notes: [{ at: 0, semitones: 0 }, { at: 0.08, semitones: -4, volume: 0.8 }]
    },
    DESTROY: {
        duration: 1, volume: 0.1, distortion: 0.35, pitchJitter: 1,
        envelope: { attack: 0.002, decay: 0.3, sustain: 0.35, release: 0.55 },
        layers: [
            { kind: 'noise', color: 'brown', filter: { type: 'lowpass', freq: 2400, freqEnd: 140 } },
            { kind: 'noise', color: 'white', gain: 0.45, duration: 0.3, filter: { type: 'lowpass', freq: 9000, freqEnd: 900 } },
            { kind: 'tone', wave: 'sine', freq: 95, freqEnd: 28, gain: 0.8 }
        ]
    },
    SUMMON: {
        duration: 0.95, volume: 0.1,
        envelope: { attack: 0.08, decay: 0.2, sustain: 0.6, release: 0.3 },
        filter: { type: 'lowpass', freq: 400, freqEnd: 6000, q: 5 },
        layers: [
            { kind: 'tone', wave: 'sawtooth', freq: 110, freqEnd: 880, sweepTime: 0.75 },
            { kind: 'tone', wave: 'sawtooth', freq: 110, freqEnd: 880, sweepTime: 0.75, detune: 14, gain: 0.6 },
            { kind: 'fm', freq: 'A5', modRatio: 2.01, modIndex: 0.5, modIndexEnd: 4, gain: 0.25, delay: 0.3 },
            { kind: 'noise', color: 'pink', gain: 0.25, filter: { type: 'bandpass', freq: 500, freqEnd: 5000, q: 2 } }
        ],
        echo: { delay: 0.16, feedback: 0.4, mix: 0.3 }
    },
    BLOCK: {
        duration: 0.75, volume: 0.1,
        envelope: { attack: 0.001, decay: 0.25, sustain: 0.2, release: 0.4 },
        layers: [
            { kind: 'fm', freq: 'A4', modRatio: 1.414, modIndex: 8, modIndexEnd: 0.4 },
            { kind: 'fm', freq: 'E5', modRatio: 2.76, modIndex: 4, modIndexEnd: 0.2, gain: 0.5 },
            { kind: 'noise', color: 'white', gain: 0.4, duration: 0.03, filter: { type: 'highpass', freq: 2500 } }
        ],
        echo: { delay: 0.09, feedback: 0.3, mix: 0.2 }
    },
    // Áudio "ao contrário": envelope com ataque longo (crescendo) e corte quase instantâneo no fim —
    // o oposto de um som normal (ataque rápido, cauda longa) — coroado por um "clique" seco bem no final,
    // imitando o transiente de um som tocado de trás pra frente.
    REVERSE: {
        duration: 0.55, volume: 0.1,
        envelope: { attack: 0.42, decay: 0.02, sustain: 1, release: 0.06 },
        layers: [
            { kind: 'noise', color: 'white', gain: 0.5, filter: { type: 'bandpass', freq: 150, freqEnd: 5500, q: 5 } },
            { kind: 'tone', wave: 'sawtooth', freq: 90, freqEnd: 1200, sweepCurve: 'exp' },
            { kind: 'tone', wave: 'sawtooth', freq: 90, freqEnd: 1200, sweepCurve: 'exp', detune: 12, gain: 0.6 },
            // O "clique" do transiente invertido: pico curto e seco no instante exato do corte
            {
                kind: 'tone', wave: 'sine', freq: 3800, delay: 0.44, duration: 0.05, gain: 0.6,
                envelope: { attack: 0.001, decay: 0.02, sustain: 0, release: 0.02 }
            }
        ],
        echo: { delay: 0.09, feedback: 0.25, mix: 0.2 }
    },
    DIRECT_HIT: {
        duration: 0.6, volume: 0.07, distortion: 0.45,
        envelope: { attack: 0.001, decay: 0.25, sustain: 0.2, release: 0.3 },
        layers: [
            { kind: 'noise', color: 'white', gain: 0.8, duration: 0.2, filter: { type: 'lowpass', freq: 10000, freqEnd: 700 } },
            { kind: 'noise', color: 'brown', gain: 0.8, filter: { type: 'lowpass', freq: 1200, freqEnd: 120 } },
            { kind: 'tone', wave: 'sine', freq: 140, freqEnd: 32, sweepTime: 0.45 }
        ]
    },
    DAMAGE: {
        duration: 0.45, volume: 0.1,
        envelope: { attack: 0.002, decay: 0.2, sustain: 0.2, release: 0.2 },
        filter: { type: 'lowpass', freq: 1800, freqEnd: 400 },
        layers: [
            { kind: 'tone', wave: 'sine', freq: 120, freqEnd: 50 },
            { kind: 'tone', wave: 'sawtooth', freq: 'D3', freqEnd: 'A2', gain: 0.25 },
            { kind: 'noise', color: 'brown', gain: 0.5, duration: 0.1 }
        ]
    },
    LOCKOUT: {
        duration: 0.55, volume: 0.1,
        envelope: { attack: 0.005, decay: 0.1, sustain: 0.7, release: 0.2 },
        filter: { type: 'lowpass', freq: 2000, q: 2 },
        layers: [
            { kind: 'tone', wave: 'square', freq: 'C3', tremolo: { rate: 18, depth: 0.5 } },
            { kind: 'tone', wave: 'square', freq: 'F#3', gain: 0.7, tremolo: { rate: 18, depth: 0.5 } }
        ]
    },
    HAND_SWAP: {
        duration: 0.9, volume: 0.1,
        envelope: { attack: 0.15, decay: 0.2, sustain: 0.6, release: 0.35 },
        layers: [
            { kind: 'noise', color: 'pink', duration: 0.45, filter: { type: 'bandpass', freq: 300, freqEnd: 3500, q: 2.5 } },
            { kind: 'noise', color: 'pink', delay: 0.4, duration: 0.5, filter: { type: 'bandpass', freq: 3500, freqEnd: 300, q: 2.5 } },
            { kind: 'tone', wave: 'sine', freq: 'E5', freqEnd: 'E6', gain: 0.2, vibrato: { rate: 6, depth: 30 } }
        ],
        echo: { delay: 0.18, feedback: 0.35, mix: 0.25 }
    },
    CONSUMABLE: {
        duration: 0.45, volume: 0.1,
        envelope: { attack: 0.002, decay: 0.15, sustain: 0.3, release: 0.2 },
        layers: [
            { kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 1800, freqEnd: 300, q: 1.2 } },
            { kind: 'fm', freq: 'C7', modRatio: 1.5, modIndex: 3, modIndexEnd: 0, gain: 0.25, delay: 0.05 }
        ],
        echo: { delay: 0.1, feedback: 0.3, mix: 0.25 }
    },

    // --- Efeitos --------------------------------------------------------------
    SPARK: {
        duration: 0.035, volume: 0.1, cooldown: 0.02, pitchJitter: 4,
        envelope: { attack: 0.001, decay: 0.025, sustain: 0, release: 0.008 },
        layers: [
            { kind: 'noise', color: 'white', filter: { type: 'highpass', freq: 5000 } },
            { kind: 'tone', wave: 'sine', freq: 4200, freqEnd: 6500, gain: 0.3 }
        ]
    },
    SPARKLE: {
        duration: 0.14, volume: 0.1,
        envelope: { attack: 0.002, decay: 0.08, sustain: 0.2, release: 0.05 },
        layers: [
            { kind: 'tone', wave: 'sine', freq: 'C6' },
            { kind: 'tone', wave: 'triangle', freq: 'C7', gain: 0.25 }
        ],
        sequence: { step: 0.05, semitones: [0, 4, 7, 12, 16] },
        echo: { delay: 0.09, feedback: 0.35, mix: 0.3 }
    },
    WHOOSH: {
        duration: 0.35, volume: 0.1, pitchJitter: 1.5,
        envelope: { attack: 0.08, decay: 0.12, sustain: 0.4, release: 0.12 },
        layers: [{ kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 400, freqEnd: 2800, q: 1.8 } }]
    },
    COLOR_CHANGE: {
        duration: 1.1, volume: 0.05,
        envelope: { attack: 0.003, decay: 0.35, sustain: 0.25, release: 0.6 },
        layers: [
            { kind: 'fm', freq: 'C5', modRatio: 2, modIndex: 3, modIndexEnd: 0.1 },
            { kind: 'tone', wave: 'sine', freq: 'C6', gain: 0.25 }
        ],
        notes: [
            { at: 0, semitones: 0 }, { at: 0.05, semitones: 4 },
            { at: 0.1, semitones: 7 }, { at: 0.15, semitones: 12, volume: 0.7 }
        ],
        echo: { delay: 0.15, feedback: 0.35, mix: 0.25 }
    },
    RAINBOW: {
        duration: 0.2, volume: 0.1,
        envelope: { attack: 0.003, decay: 0.1, sustain: 0.3, release: 0.08 },
        layers: [
            { kind: 'tone', wave: 'triangle', freq: 'C5' },
            { kind: 'tone', wave: 'sine', freq: 'C6', gain: 0.3, detune: 7 }
        ],
        sequence: { step: 0.045, semitones: [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24] },
        echo: { delay: 0.12, feedback: 0.4, mix: 0.3 }
    },

    // --- Partida --------------------------------------------------------------
    VICTORY: {
        duration: 0.16, volume: 0.1,
        envelope: { attack: 0.005, decay: 0.08, sustain: 0.6, release: 0.08 },
        layers: [
            { kind: 'tone', wave: 'square', freq: 'C5', gain: 0.35, filter: { type: 'lowpass', freq: 3500 } },
            { kind: 'tone', wave: 'triangle', freq: 'C5' },
            { kind: 'tone', wave: 'triangle', freq: 'C4', gain: 0.5 }
        ],
        notes: [
            { at: 0, semitones: 0 }, { at: 0.15, semitones: 4 }, { at: 0.3, semitones: 7 },
            { at: 0.45, semitones: 12, duration: 0.2 }, { at: 0.66, semitones: 7, duration: 0.12 },
            { at: 0.8, semitones: 12, duration: 0.7 }
        ],
        echo: { delay: 0.14, feedback: 0.3, mix: 0.2 }
    },
    DEFEAT: {
        duration: 0.3, volume: 0.1,
        envelope: { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.15 },
        filter: { type: 'lowpass', freq: 1600, freqEnd: 500, time: 2 },
        layers: [
            { kind: 'tone', wave: 'sawtooth', freq: 'G4', gain: 0.5 },
            { kind: 'tone', wave: 'triangle', freq: 'G3', vibrato: { rate: 5, depth: 15 } }
        ],
        notes: [
            { at: 0, semitones: 0 }, { at: 0.3, semitones: -1 },
            { at: 0.6, semitones: -2 }, { at: 0.9, semitones: -5, duration: 0.9 }
        ]
    }
});

/** Nomes dos sons (SFX.CLASH === 'CLASH'): evita strings soltas nas chamadas. */
export const SFX = Object.freeze(Object.fromEntries(Object.keys(SOUND_PRESETS).map((name) => [name, name])));

/** Nomes dos samples gravados registrados em CONFIG.AUDIO.SAMPLES (SAMPLES.CARD_HOVER === 'CARD_HOVER'). */
export const SAMPLES = Object.freeze(
    Object.fromEntries(Object.keys(CONFIG.AUDIO.SAMPLES).map((name) => [name, name]))
);
