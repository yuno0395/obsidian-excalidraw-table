// Positions: the box around some elements, and drawing <-> window coordinates.
// Pure functions (tested in test/geom.test.ts).

export type Box = { x0: number; y0: number; x1: number; y1: number };
type Point = [number, number];
// an Excalidraw element as far as its place goes (lines, arrows and drawings also have points, relative to x, y)
export type Shape = { x: number; y: number; width: number; height: number; points?: Point[]; fontSize?: number };

// The box an element takes up. A line's x, y is its first point, and its other points may lie left of or above it.
export function elementBox(e: Shape): Box {
  if (e.points?.length) {
    const xs = e.points.map((p) => p[0]), ys = e.points.map((p) => p[1]);
    return { x0: e.x + Math.min(...xs), y0: e.y + Math.min(...ys), x1: e.x + Math.max(...xs), y1: e.y + Math.max(...ys) };
  }
  return { x0: e.x, y0: e.y, x1: e.x + e.width, y1: e.y + e.height };
}

// the smallest box around the elements; null for none
export function bounds(els: Shape[]): Box | null {
  if (!els.length) return null;
  const b: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const e of els) {
    const m = elementBox(e);
    b.x0 = Math.min(b.x0, m.x0); b.y0 = Math.min(b.y0, m.y0); b.x1 = Math.max(b.x1, m.x1); b.y1 = Math.max(b.y1, m.y1);
  }
  return b;
}

// Move and scale an element as part of a group: its offset from `from` is scaled by s and put at `to`,
// and its size, its points and its font size are scaled by s (what Excalidraw does when a group is resized).
// Returns the changed properties.
export function placeElement(e: Shape, s: number, from: { x: number; y: number }, to: { x: number; y: number }): Partial<Shape> {
  const p: Partial<Shape> = { x: to.x + (e.x - from.x) * s, y: to.y + (e.y - from.y) * s };
  if (s === 1) return p;
  p.width = e.width * s; p.height = e.height * s;
  if (e.points) p.points = e.points.map(([x, y]) => [x * s, y * s] as Point);
  if (typeof e.fontSize === "number") p.fontSize = e.fontSize * s;
  return p;
}

// Excalidraw's app state as far as positions go: zoom, scroll, and where the canvas sits in the window
export type ViewState = { zoom?: { value: number }; scrollX: number; scrollY: number; offsetLeft: number; offsetTop: number };

export const zoomOf = (st: Pick<ViewState, "zoom">) => st.zoom?.value ?? 1;
// drawing -> window
export const screenX = (st: ViewState, x: number) => (x + st.scrollX) * zoomOf(st) + st.offsetLeft;
export const screenY = (st: ViewState, y: number) => (y + st.scrollY) * zoomOf(st) + st.offsetTop;
// window -> drawing
export const sceneX = (st: ViewState, x: number) => (x - st.offsetLeft) / zoomOf(st) - st.scrollX;
export const sceneY = (st: ViewState, y: number) => (y - st.offsetTop) / zoomOf(st) - st.scrollY;
