// Small helpers shared by the scene code and the view hook.

// Wait until test() is true (checked about every frame), at most ms. Returns whether it became true.
export function until(test: () => boolean, ms: number): Promise<boolean> {
  return new Promise((done) => {
    const t0 = Date.now();
    const tick = () => {
      if (test()) return done(true);
      if (Date.now() - t0 >= ms) return done(false);
      setTimeout(tick, 16);
    };
    setTimeout(tick, 16);
  });
}

export const rnd = () => Math.floor(Math.random() * 2 ** 31);

// A changed copy of an Excalidraw element, with the version bumped so Excalidraw (and undo) see the change.
export const upd = (e: any, p: any) => ({ ...e, ...p, version: (e.version || 1) + 1, versionNonce: rnd(), updated: Date.now() });

// ---------- Excalidraw's undo history ----------
// Excalidraw keeps a snapshot of the drawing; a "capture" records everything changed since the snapshot as one undo step.
// The plugin's updates are left uncaptured while a command runs (LATER), then captured together at the end with commit(),
// so one Ctrl+Z undoes the whole command. Selection changes are not recorded (NEVER: undo is for content).
// (updateScene's own capture would only record the change that call makes, so it cannot gather a command's steps.)
export const LATER = { captureUpdate: "EVENTUALLY" } as const;
export const NEVER = { captureUpdate: "NEVER" } as const;
// Capture at the next render: a selection call that changes nothing is the public way to ask for a capture.
// Excalidraw versions without the selection API: nothing happens (undo then works as before).
export function commit(api: any) {
  if (typeof api.selection?.remove === "function") api.selection.remove([], { captureUpdate: "IMMEDIATELY" });
}

// The scene's elements with some of them replaced by changed copies (same order), for updateScene.
export function withChanges(els: any[], changed: Iterable<any>): any[] {
  const m = new Map(els.map((e) => [e.id, e]));
  for (const c of changed) m.set(c.id, c);
  return [...m.values()];
}

// max / min of a list without spreading it into arguments (a long list would overflow the call stack)
export const maxOf = (a: number[], empty = 0) => (a.length ? a.reduce((x, y) => (y > x ? y : x)) : empty);
export const minOf = (a: number[], empty = 0) => (a.length ? a.reduce((x, y) => (y < x ? y : x)) : empty);
