// Colour themes for new tables: the line colour, and the fill (colour + opacity) of the top row and of the other rows.
// Pure functions (tested in test/theme.test.ts).

import type { Colors } from "./model";

export type Paint = { color: string; alpha: number };   // alpha: opacity in %, 0 to 100
export type Theme = { stroke: string; header: Paint; body: Paint };
export type SavedTheme = Theme & { name: string };

// No fill is drawn with an almost invisible white: Excalidraw cannot click inside a shape that is really transparent,
// so a cell with no fill at all could not be selected or typed into.
export const NO_FILL = "#ffffff01";

const TEXT = "#1e1e1e";
// the built-in theme: black lines, a light grey top row, no fill below
export const DEFAULT_THEME: Theme = { stroke: TEXT, header: { color: "#e9ecef", alpha: 100 }, body: { color: "#ffffff", alpha: 0 } };

// "#abc" / "#aabbcc" / "#aabbccdd" -> [r, g, b, a(0-1)]; anything else -> null
export function rgba(c: string): [number, number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec((c || "").trim()); if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map((x) => x + x).join("") : m[1];
  const v = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return [v[0], v[1], v[2], h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
}
export const rgb = (c: string): [number, number, number] | null => { const x = rgba(c); return x ? [x[0], x[1], x[2]] : null; };
const hex2 = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
const hex = (c: number[]) => "#" + c.map(hex2).join("");
// t = 0: a, t = 1: b (opaque colours)
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a), y = rgb(b); if (!x || !y) return a;
  return hex(x.map((v, i) => v + (y[i] - v) * t));
}
// relative luminance (WCAG); a colour that cannot be read counts as white
export function luminance(c: string): number {
  const x = rgb(c); if (!x) return 1;
  const [r, g, b] = x.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Almost no fill (transparent, or opacity under about 3%): shows the canvas.
export const isNoFill = (c?: string) => { if (!c || c === "transparent") return true; const x = rgba(c); return !!x && x[3] < 0.03; };
// The colour as it looks on a white page (for Excel, and for choosing the text colour); null for no fill.
export function onWhite(c?: string): string | null {
  if (isNoFill(c)) return null;
  const x = rgba(c!); if (!x) return c ?? null;
  return hex([0, 1, 2].map((i) => 255 + (x[i] - 255) * x[3]));
}
// black or white text, whichever reads better on bg
export const textOn = (bg: string) => { const w = onWhite(bg); return !w || luminance(w) > 0.4 ? TEXT : "#ffffff"; };

// a fill as an Excalidraw colour: opaque "#rrggbb", see-through "#rrggbbaa", nothing: NO_FILL
export function paintColor(p: Paint): string {
  const c = rgb(p.color) ? p.color : "#ffffff", a = Math.min(100, Math.max(0, Number(p.alpha) || 0));
  if (a <= 0) return NO_FILL;
  const base = hex(rgb(c)!);
  return a >= 100 ? base : base + hex2((a / 100) * 255);
}

export function colorsOf(th: unknown): Colors {
  const t = normalizeTheme(th);
  const header = paintColor(t.header), cell = paintColor(t.body);
  return { header, cell, stroke: t.stroke, text: textOn(cell), headerText: textOn(header) };
}

const okColor = (c: unknown): c is string => typeof c === "string" && !!rgb(c);
const okPaint = (p: any): p is Paint => !!p && okColor(p.color) && typeof p.alpha === "number";
// Earlier versions: one colour with fills "none" | "light" | "solid", or {kind, color, mode}.
function oldFill(color: string, f: string): Paint {
  return f === "solid" ? { color, alpha: 100 } : f === "light" ? { color: mix(color, "#ffffff", 0.85), alpha: 100 } : { color: "#ffffff", alpha: 0 };
}
// A theme from the settings, in any shape this plugin has saved; anything unreadable: the default theme.
export function normalizeTheme(x: any): Theme {
  if (!x || typeof x !== "object") return clone(DEFAULT_THEME);
  if (okColor(x.stroke) && okPaint(x.header) && okPaint(x.body)) return { stroke: x.stroke, header: { ...x.header }, body: { ...x.body } };
  if (okColor(x.color) && typeof x.header === "string" && typeof x.body === "string") {
    const solid = x.header === "solid" || x.body === "solid";
    return { stroke: solid ? mix(x.color, "#000000", 0.3) : x.color, header: oldFill(x.color, x.header), body: oldFill(x.color, x.body) };
  }
  if (okColor(x.color) && (x.kind === "color" || typeof x.mode === "string")) {
    return x.mode === "fill" ? normalizeTheme({ color: x.color, header: "solid", body: "light" }) : normalizeTheme({ color: x.color, header: "light", body: "none" });
  }
  return clone(DEFAULT_THEME);
}
const clone = (t: Theme): Theme => ({ stroke: t.stroke, header: { ...t.header }, body: { ...t.body } });

const samePaint = (a: Paint, b: Paint) => paintColor(a).toLowerCase() === paintColor(b).toLowerCase();
export const sameTheme = (a: unknown, b: unknown) => {
  const x = normalizeTheme(a), y = normalizeTheme(b);
  return x.stroke.toLowerCase() === y.stroke.toLowerCase() && samePaint(x.header, y.header) && samePaint(x.body, y.body);
};
