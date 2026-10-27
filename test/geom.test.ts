import { test } from "node:test";
import * as assert from "node:assert/strict";
import { bounds, elementBox, placeElement, sceneX, sceneY, screenX, screenY } from "../src/geom";

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

test("elementBox: a line's points can lie left of and above its x, y", () => {
  assert.deepEqual(elementBox({ x: 10, y: 10, width: 30, height: 20, points: [[0, 0], [-30, 20]] }), { x0: -20, y0: 10, x1: 10, y1: 30 });
  assert.deepEqual(bounds([{ x: 0, y: 0, width: 5, height: 5 }, { x: 10, y: 10, width: 30, height: 20, points: [[0, 0], [-30, 20]] }]),
    { x0: -20, y0: 0, x1: 10, y1: 30 });
});

test("placeElement: offsets, sizes, points and font scale together; s = 1 only moves", () => {
  const from = { x: 100, y: 100 }, to = { x: 0, y: 0 };
  assert.deepEqual(placeElement({ x: 120, y: 110, width: 40, height: 20 }, 1, from, to), { x: 20, y: 10 });
  assert.deepEqual(placeElement({ x: 120, y: 110, width: 40, height: 20 }, 0.5, from, to), { x: 10, y: 5, width: 20, height: 10 });
  const line = placeElement({ x: 100, y: 100, width: 40, height: 20, points: [[0, 0], [40, 20]] }, 0.5, from, to);
  assert.deepEqual(line.points, [[0, 0], [20, 10]]);
  assert.equal(placeElement({ x: 100, y: 100, width: 40, height: 20, fontSize: 20 }, 0.5, from, to).fontSize, 10);
});
