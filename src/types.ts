/** Content as exported from opt-prep (markdown) and as the app sees it (HTML). */

export interface RawSection {
  id: string; // "w1-p1-s2"
  num: number; // 0 = the part's intro text
  title: string;
  label: string; // short name for outlines and pickers
  md: string;
  cards: string[];
}
export interface RawCard {
  id: string;
  sec: string;
  week: number;
  q: string;
  term: string;
  k: string; // recall chain, plain text with → and ·
  level: string;
  keys: string[];
  wrong: string[];
  follow: string[];
  answer: string;
  nb: boolean; // in the notebook when exported
}
export interface RawKit {
  exported: string;
  weeks: Week<RawSection>[];
  cards: RawCard[];
}

export interface Section extends Omit<RawSection, 'md'> {
  html: string;
}
export interface Part<S = Section> {
  id: string; // "w1-p1"
  num: number;
  title: string;
  sections: S[];
}
export interface Week<S = Section> {
  num: number;
  theme: string;
  dates: string;
  parts: Part<S>[];
}
/** Card fields are HTML (inline markdown rendered at build), except `term` and `k`. */
export type Card = RawCard;
export interface Kit {
  exported: string;
  weeks: Week[];
  cards: Card[];
}
