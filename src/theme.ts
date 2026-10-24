// Colour themes for new tables: one colour, used for the lines or for the background.
// Pure functions (tested in test/theme.test.ts).

import type { Colors } from "./model";

export type ThemeMode = "line" | "fill";
// what the user picked: the default colours (from the settings), or a colour and how to use it
export type ThemeChoice = { kind: "default" } | { kind: "color"; color: string; mode: ThemeMode };
export type SavedTheme = { name: string; color: string; mode: ThemeMode };

export const PRESETS: { name: string; color: string }[] = [
  { name: "Blue", color: "#1971c2" },
  { name: "Teal", color: "#0c8599" },
  { name: "Green", color: "#2f9e44" },
  { name: "Yellow", color: "#f08c00" },
  { name: "Orange", color: "#e8590c" },
  { name: "Red", color: "#e03131" },
  { name: "Violet", color: "#7048e8" },
  { name: "Gray", color: "#495057" },
];

const TEXT = "#1e1e1e";

// "#abc" / "#aabbcc" -> [r, g, b]; anything else -> null
export function rgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex || "").trim()); if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
const hex = (c: number[]) => "#" + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
// t = 0: a, t = 1: b
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a), y = rgb(b); if (!x || !y) return a;
  return hex(x.map((v, i) => v + (y[i] - v) * t));
}
// relative luminance (WCAG)
export function luminance(c: string): number {
  const x = rgb(c); if (!x) return 1;
  const [r, g, b] = x.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
// black or white text, whichever reads better on bg
export const textOn = (bg: string) => (luminance(bg) > 0.4 ? TEXT : "#ffffff");

// The table colours of a choice. def: the default colours (from the settings).
export function colorsOf(choice: ThemeChoice | null | undefined, def: Colors): Colors {
  if (!choice || choice.kind !== "color" || !rgb(choice.color)) return { ...def };
  const c = choice.color;
  if (choice.mode === "line") return { stroke: c, header: mix(c, "#ffffff", 0.85), cell: "#ffffff", text: TEXT, headerText: TEXT };
  return { stroke: mix(c, "#000000", 0.3), header: c, cell: mix(c, "#ffffff", 0.9), text: TEXT, headerText: textOn(c) };
}

export const sameChoice = (a: ThemeChoice | null | undefined, b: ThemeChoice | null | undefined) =>
  (a?.kind ?? "default") === (b?.kind ?? "default") &&
  (a?.kind !== "color" || (b?.kind === "color" && a.color.toLowerCase() === b.color.toLowerCase() && a.mode === b.mode));
