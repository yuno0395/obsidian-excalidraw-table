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

// The scene's elements with some of them replaced by changed copies (same order), for updateScene.
export function withChanges(els: any[], changed: Iterable<any>): any[] {
  const m = new Map(els.map((e) => [e.id, e]));
  for (const c of changed) m.set(c.id, c);
  return [...m.values()];
}

// max / min of a list without spreading it into arguments (a long list would overflow the call stack)
export const maxOf = (a: number[], empty = 0) => (a.length ? a.reduce((x, y) => (y > x ? y : x)) : empty);
export const minOf = (a: number[], empty = 0) => (a.length ? a.reduce((x, y) => (y < x ? y : x)) : empty);
