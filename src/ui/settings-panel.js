import { CONFIG } from '../config/constants.js';
import { SFX } from '../config/sound-presets.js';

const { BUS } = CONFIG.AUDIO;
const STORAGE_KEY = 'yugi-uno:volume';

/**
 * SettingsPanel - ícone de engrenagem (topo direito, sempre visível) + painel com 3 sliders de volume.
 *
 * 100% = o volume padrão de cada barramento em CONFIG.AUDIO.VOLUME; o slider aplica uma fração
 * disso (AudioEngine.setVolumeFraction), nunca um valor absoluto. "Efeitos Sonoros" controla os
 * barramentos SFX e UI juntos — o jogador não precisa saber que são dois barramentos internos.
 * A escolha do jogador persiste em localStorage e volta a valer na próxima visita.
 */
export class SettingsPanel {
    /** @param {import('../audio/audio-engine.js').AudioEngine} audio */
    constructor(audio) {
        this.audio = audio;
        const $ = (id) => document.getElementById(id);

        this.groups = [
            { input: $('volume-master'), value: $('volume-master-value'), buses: [BUS.MASTER] },
            { input: $('volume-music'), value: $('volume-music-value'), buses: [BUS.MUSIC] },
            { input: $('volume-sfx'), value: $('volume-sfx-value'), buses: [BUS.SFX, BUS.UI] }
        ];
        this.button = $('settings-btn');
        this.panel = $('settings-panel');
        this.closeBtn = $('settings-close');

        this.loadSaved();
        this.bindEvents();
    }

    /** Restaura os sliders do localStorage (ou 100% se não houver nada salvo) e aplica no motor de áudio. */
    loadSaved() {
        let saved = null;
        try {
            saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        } catch (err) { /* armazenamento indisponível ou dado corrompido: usa os padrões */ }

        for (const group of this.groups) {
            const key = group.buses[0];
            const percent = saved && Number.isFinite(saved[key]) ? Math.min(100, Math.max(0, saved[key])) : 100;
            group.input.value = String(percent);
            this.apply(group, percent);
        }
    }

    bindEvents() {
        this.button.addEventListener('click', () => this.open());
        this.closeBtn.addEventListener('click', () => this.close());
        // Clique fora do cartão (no fundo escurecido) também fecha
        this.panel.addEventListener('click', (e) => {
            if (e.target === this.panel) this.close();
        });

        for (const group of this.groups) {
            group.input.addEventListener('input', () => {
                this.apply(group, Number(group.input.value));
                this.save();
            });
        }
    }

    apply(group, percent) {
        group.value.textContent = `${percent}%`;
        for (const bus of group.buses) this.audio.setVolumeFraction(bus, percent / 100);
    }

    save() {
        const data = {};
        for (const group of this.groups) data[group.buses[0]] = Number(group.input.value);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (err) { /* armazenamento indisponível: a escolha só vale pra esta sessão */ }
    }

    open() {
        this.audio.play(SFX.CLICK);
        this.panel.hidden = false;
        requestAnimationFrame(() => this.panel.classList.add('active'));
    }

    close() {
        this.audio.play(SFX.CLICK);
        this.panel.classList.remove('active');
    }
}
