import { PT_BR } from './pt.js';
import { EN } from './en.js';
import { ES } from './es.js';
import { DE } from './de.js';
import { FR } from './fr.js';
import { IT } from './it.js';
import { JA } from './ja.js';

export const LANGUAGES = {
    'pt-BR': { name: 'Português', dict: PT_BR },
    'en': { name: 'English', dict: EN },
    'es': { name: 'Español', dict: ES },
    'de': { name: 'Deutsch', dict: DE },
    'fr': { name: 'Français', dict: FR },
    'it': { name: 'Italiano', dict: IT },
    'ja': { name: '日本語', dict: JA }
};

export const DEFAULT_LANGUAGE = 'en';

class I18nManager {
    constructor() {
        this.currentLang = this.detectLanguage();
        this.dict = LANGUAGES[this.currentLang].dict;
    }

    detectLanguage() {
        // Check local storage first
        const saved = localStorage.getItem('yugi_uno_lang');
        if (saved && LANGUAGES[saved]) {
            return saved;
        }

        // Check browser language
        const browserLang = navigator.language || navigator.userLanguage;
        if (LANGUAGES[browserLang]) {
            return browserLang;
        }

        // Try exact match or base language (e.g., 'pt-PT' -> 'pt-BR' if possible, or fallback)
        const base = browserLang.split('-')[0];
        for (const key in LANGUAGES) {
            if (key.startsWith(base)) {
                return key;
            }
        }

        return DEFAULT_LANGUAGE;
    }

    setLanguage(langCode) {
        if (!LANGUAGES[langCode]) return;
        this.currentLang = langCode;
        this.dict = LANGUAGES[langCode].dict;
        localStorage.setItem('yugi_uno_lang', langCode);
        this.updateDOM();
    }

    t(key, params = {}) {
        let text = this.dict[key] || EN[key] || key;
        for (const [k, v] of Object.entries(params)) {
            text = text.replace(new RegExp(`{${k}}`, 'gi'), v);
        }
        return text;
    }

    updateDOM() {
        const elements = document.querySelectorAll('[data-i18n]');
        elements.forEach(el => {
            const key = el.getAttribute('data-i18n');
            const text = this.t(key);
            
            // Allow setting placeholder using data-i18n-attr="placeholder"
            const targetAttr = el.getAttribute('data-i18n-attr');
            if (targetAttr) {
                el.setAttribute(targetAttr, text);
            } else {
                el.textContent = text;
            }
        });
        
        // Also update the html lang attribute
        document.documentElement.lang = this.currentLang;
    }
}

export const i18n = new I18nManager();
