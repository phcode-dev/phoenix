// Adapted i18n — receives locale from Phoenix via postMessage instead of Tauri
import { getState, setState } from "./state.js";

const RTL_LOCALES = new Set(["ar", "he", "ur"]);

let translations = {};
let fallback = {};

export async function initI18n() {
    // Load fallback (English) first
    fallback = await loadLocale("en");

    // Use navigator locale as default
    let detectedLocale = "en";
    try {
        const navLocale = navigator.language;
        if (navLocale) {
            detectedLocale = navLocale.split("-")[0].split("_")[0];
        }
    } catch (e) {
        // ignore
    }

    const state = getState();
    const targetLocale = state.locale || detectedLocale;
    await setLocale(targetLocale);
}

async function loadLocale(locale) {
    try {
        const module = await import(`../locales/${locale}.json`);
        return module.default || module;
    } catch (e) {
        console.warn(`Failed to load locale '${locale}', falling back to English`);
        return {};
    }
}

export async function setLocale(locale) {
    // Strip region code (e.g. "en-US" → "en") since locale files use base language
    const baseLocale = locale.split("-")[0].split("_")[0];
    translations = await loadLocale(baseLocale);
    setState({ locale: baseLocale });
    applyTranslations();
    document.documentElement.lang = baseLocale;
    document.documentElement.dir = RTL_LOCALES.has(baseLocale) ? "rtl" : "ltr";
}

export function t(key) {
    const keys = key.split(".");
    let value = translations;
    let fb = fallback;

    for (const k of keys) {
        value = value?.[k];
        fb = fb?.[k];
    }

    return value || fb || key;
}

export function tp(key, params = {}) {
    let str = t(key);
    for (const [k, v] of Object.entries(params)) {
        str = str.replaceAll(`{${k}}`, v);
    }
    return str;
}

export function applyTranslations() {
    const elements = document.querySelectorAll("[data-i18n]");
    for (const el of elements) {
        const key = el.getAttribute("data-i18n");
        const translated = t(key);
        if (translated !== key) {
            el.textContent = translated;
        }
    }

    const placeholders = document.querySelectorAll("[data-i18n-placeholder]");
    for (const el of placeholders) {
        const key = el.getAttribute("data-i18n-placeholder");
        const translated = t(key);
        if (translated !== key) {
            el.placeholder = translated;
        }
    }

    const ariaLabels = document.querySelectorAll("[data-i18n-aria]");
    for (const el of ariaLabels) {
        const key = el.getAttribute("data-i18n-aria");
        const translated = t(key);
        if (translated !== key) {
            el.setAttribute("aria-label", translated);
        }
    }

    const tooltips = document.querySelectorAll("[data-i18n-tooltip]");
    for (const el of tooltips) {
        const key = el.getAttribute("data-i18n-tooltip");
        const translated = t(key);
        if (translated !== key) {
            el.setAttribute("data-tooltip", translated);
        }
    }
}
