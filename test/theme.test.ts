import { test } from "node:test";
import * as assert from "node:assert/strict";
import { colorsOf, luminance, mix, rgb, sameChoice, textOn } from "../src/theme";

const def = { header: "#e9ecef", cell: "#ffffff", stroke: "#495057" };

test("colour helpers", () => {
  assert.deepEqual(rgb("#1971c2"), [25, 113, 194]);
  assert.deepEqual(rgb("#fff"), [255, 255, 255]);
  assert.equal(rgb("blue"), null);
  assert.equal(mix("#000000", "#ffffff", 0.5), "#808080");
  assert.ok(luminance("#ffffff") > 0.99 && luminance("#000000") < 0.01);
  assert.equal(textOn("#1971c2"), "#ffffff");
  assert.equal(textOn("#ffe066"), "#1e1e1e");
});

test("default theme uses the settings colours", () => {
  assert.deepEqual(colorsOf(null, def), def);
  assert.deepEqual(colorsOf({ kind: "default" }, def), def);
  assert.deepEqual(colorsOf({ kind: "color", color: "nope", mode: "line" }, def), def);
});

test("line theme: coloured lines, light header, white body", () => {
  const C = colorsOf({ kind: "color", color: "#e03131", mode: "line" }, def);
  assert.equal(C.stroke, "#e03131");
  assert.equal(C.cell, "#ffffff");
  assert.ok(luminance(C.header) > 0.7);
  assert.equal(C.headerText, "#1e1e1e");
});

test("fill theme: coloured header with readable text, light body, darker lines", () => {
  const C = colorsOf({ kind: "color", color: "#1971c2", mode: "fill" }, def);
  assert.equal(C.header, "#1971c2");
  assert.equal(C.headerText, "#ffffff");
  assert.ok(luminance(C.cell) > 0.8);
  assert.ok(luminance(C.stroke) < luminance("#1971c2"));
});

test("same choice", () => {
  assert.ok(sameChoice(null, { kind: "default" }));
  assert.ok(sameChoice({ kind: "color", color: "#ABC", mode: "fill" }, { kind: "color", color: "#abc", mode: "fill" }));
  assert.ok(!sameChoice({ kind: "color", color: "#abc", mode: "fill" }, { kind: "color", color: "#abc", mode: "line" }));
});
