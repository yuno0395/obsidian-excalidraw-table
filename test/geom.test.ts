import { test } from "node:test";
import * as assert from "node:assert/strict";
import { bounds, sceneX, sceneY, screenX, screenY } from "../src/geom";

test("bounds: the box around the elements, null for none", () => {
  assert.equal(bounds([]), null);
  assert.deepEqual(bounds([{ x: 10, y: 20, width: 30, height: 5 }, { x: -5, y: 22, width: 10, height: 10 }]), { x0: -5, y0: 20, x1: 40, y1: 32 });
});

test("screen and scene coordinates are inverse", () => {
  const st = { zoom: { value: 2 }, scrollX: -100, scrollY: 50, offsetLeft: 30, offsetTop: 40 };
  assert.equal(screenX(st, 120), (120 - 100) * 2 + 30);
  assert.equal(screenY(st, -10), (-10 + 50) * 2 + 40);
  for (const v of [-300, 0, 17.5, 999]) {
    assert.ok(Math.abs(sceneX(st, screenX(st, v)) - v) < 1e-9);
    assert.ok(Math.abs(sceneY(st, screenY(st, v)) - v) < 1e-9);
  }
  // no zoom in the state: 1
  assert.equal(screenX({ scrollX: 0, scrollY: 0, offsetLeft: 0, offsetTop: 0 }, 5), 5);
});
