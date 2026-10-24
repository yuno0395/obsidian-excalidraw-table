// Positions: the box around some elements, and drawing <-> window coordinates.
// Pure functions (tested in test/geom.test.ts).

export type Box = { x0: number; y0: number; x1: number; y1: number };
type Rect = { x: number; y: number; width: number; height: number };

// the smallest box around the elements; null for none
export function bounds(els: Rect[]): Box | null {
  if (!els.length) return null;
  const b: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const e of els) {
    b.x0 = Math.min(b.x0, e.x); b.y0 = Math.min(b.y0, e.y);
    b.x1 = Math.max(b.x1, e.x + e.width); b.y1 = Math.max(b.y1, e.y + e.height);
  }
  return b;
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
