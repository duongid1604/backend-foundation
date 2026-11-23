/* Folio's storage helpers: everything stays in this browser, under one prefix. */
const PREFIX = 'bf:';

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/** Returns false when storage is unavailable or full. */
export function save(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export type Theme = 'system' | 'light' | 'dark';
export type View = 'read' | 'practice';

/** Reading page width: null = default (70ch), a px width, or 'full' (fill the pane). Folio's. */
export type PageWidth = number | 'full' | null;
export const pageWidthCss = (w: PageWidth) => (w === null ? '70ch' : w === 'full' ? '100%' : `${Math.round(w)}px`);
export const validWidth = (w: unknown): PageWidth => (w === 'full' || (typeof w === 'number' && w >= 200 && w <= 20000) ? w : null);

export interface Settings {
  theme: Theme;
  view: View;
  week: number;
  serif: boolean;
  outline: boolean;
  /** Show each section's questions above its reading (on by default). */
  qfirst: boolean;
  width: PageWidth;
}
