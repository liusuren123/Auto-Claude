/**
 * App language tracking module for main process.
 *
 * Tracks the user's in-app language setting (not OS locale) for use in
 * main process code that needs localized strings (e.g., context menus,
 * system notifications).
 *
 * Updated via IPC when user changes language in settings.
 *
 * Also provides a lightweight `t()` helper that loads the shared locale
 * JSON files synchronously at startup, so main-process code can localize
 * strings without setting up a full i18next instance.
 */

import { app } from 'electron';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// Current app language, defaults to 'en'
// Updated via setAppLanguage() when renderer notifies of language change
let currentAppLanguage = 'en';

// Loaded locale resources keyed by language code, then by namespace
// e.g. resources['zh']['tasks']['referenceImages']['title']
type LocaleResources = Record<string, Record<string, any>>;

let resources: LocaleResources = {};
let loaded = false;
let supportedLanguages: string[] = ['en', 'zh', 'fr'];

/**
 * Get the current app language.
 * Falls back to 'en' if not set.
 */
export function getAppLanguage(): string {
  return currentAppLanguage;
}

/**
 * Set the current app language.
 * Called by IPC handler when renderer changes language.
 */
export function setAppLanguage(language: string): void {
  currentAppLanguage = language;
}

/**
 * Initialize app language from OS locale as a starting point.
 * The renderer will update this once i18n initializes.
 */
export function initAppLanguage(): void {
  try {
    // app.getLocale() may not be available in test environments
    const osLocale = app?.getLocale?.() || 'en';
    // Extract base language (e.g., 'en-US' -> 'en')
    const base = osLocale.split('-')[0] || 'en';
    currentAppLanguage = supportedLanguages.includes(base) ? base : 'en';
  } catch {
    currentAppLanguage = 'en';
  }
  // Best-effort load of locale JSONs. If loading fails (e.g. in tests
  // without the locale files), `t()` will fall back to the key string.
  try {
    loadResources();
  } catch {
    // ignore
  }
}

/**
 * Synchronously load shared locale JSON files into memory.
 * Called from initAppLanguage; safe to call again to refresh.
 */
function loadResources(): void {
  // Locales live at apps/desktop/src/shared/i18n/locales/{lang}/{ns}.json
  // In dev, __dirname is apps/desktop/src/main; in production it's bundled.
  // Try a few likely roots.
  const candidates = [
    join(__dirname, '..', '..', 'src', 'shared', 'i18n', 'locales'),
    join(__dirname, '..', 'src', 'shared', 'i18n', 'locales'),
    join(__dirname, '..', '..', '..', 'shared', 'i18n', 'locales'),
    join(process.cwd(), 'src', 'shared', 'i18n', 'locales'),
  ];
  let base = '';
  for (const c of candidates) {
    if (existsSync(join(c, 'en'))) {
      base = c;
      break;
    }
  }
  if (!base) return;

  const namespaces = ['common', 'navigation', 'settings', 'tasks', 'welcome',
    'onboarding', 'dialogs', 'gitlab', 'taskReview', 'terminal', 'errors', 'components'];
  const next: LocaleResources = {};
  for (const lang of supportedLanguages) {
    next[lang] = {};
    for (const ns of namespaces) {
      const p = join(base, lang, `${ns}.json`);
      if (existsSync(p)) {
        try {
          next[lang][ns] = JSON.parse(readFileSync(p, 'utf8'));
        } catch {
          // ignore malformed files
        }
      }
    }
  }
  resources = next;
  loaded = true;
}

/**
 * Translate a dotted key path against the current app language.
 * Falls back to 'en', then to the key itself if not found.
 * Supports {{var}} interpolation.
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  if (!loaded) {
    try { loadResources(); } catch { /* ignore */ }
  }
  const tryLangs = [currentAppLanguage, 'en'];
  for (const lang of tryLangs) {
    const value = lookup(resources[lang], key);
    if (typeof value === 'string') {
      return interpolate(value, vars);
    }
  }
  return key;
}

function lookup(bag: any, key: string): any {
  if (!bag) return undefined;
  const parts = key.split('.');
  let cur: any = bag;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in cur) {
      cur = cur[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name) => {
    const v = vars[name];
    return v === undefined ? `{{${name}}}` : String(v);
  });
}
