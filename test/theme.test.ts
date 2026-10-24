import { test } from "node:test";
import * as assert from "node:assert/strict";
import { DEFAULT_THEME, NO_FILL, colorsOf, isNoFill, luminance, mix, normalizeTheme, onWhite, paintColor, rgba, sameTheme, textOn } from "../src/theme";

test("colour helpers", () => {
  assert.deepEqual(rgba("#1971c2"), [25, 113, 194, 1]);
  assert.deepEqual(rgba("#ffffff80")?.slice(0, 3), [255, 255, 255]);
  assert.ok(Math.abs(rgba("#ffffff80")![3] - 128 / 255) < 1e-9);
  assert.equal(rgba("blue"), null);
  assert.equal(mix("#000000", "#ffffff", 0.5), "#808080");
  assert.ok(luminance("#ffffff") > 0.99 && luminance("#000000") < 0.01);
  assert.equal(textOn("#1971c2"), "#ffffff");
  assert.equal(textOn("#1971c233"), "#1e1e1e");   // a see-through blue on white is light
  assert.equal(textOn(NO_FILL), "#1e1e1e");
  assert.ok(isNoFill(NO_FILL) && isNoFill("transparent") && !isNoFill("#ffffff") && !isNoFill("#00000080"));
  assert.equal(onWhite("#00000080"), "#7f7f7f");
  assert.equal(onWhite(NO_FILL), null);
});

test("fill: colour and opacity", () => {
  assert.equal(paintColor({ color: "#1971c2", alpha: 100 }), "#1971c2");
  assert.equal(paintColor({ color: "#1971c2", alpha: 50 }), "#1971c280");
  assert.equal(paintColor({ color: "#1971c2", alpha: 0 }), NO_FILL);
  assert.equal(paintColor({ color: "#abc", alpha: 120 }), "#aabbcc");
});

test("default: black lines, light grey top row, no fill below", () => {
  const C = colorsOf(DEFAULT_THEME);
  assert.equal(C.stroke, "#1e1e1e");
  assert.equal(C.header, "#e9ecef");
  assert.equal(C.cell, NO_FILL);
  assert.equal(C.headerText, "#1e1e1e");
  assert.equal(C.text, "#1e1e1e");
  assert.deepEqual(colorsOf(null), C);
});

test("line colour, top row and other rows chosen separately", () => {
  const C = colorsOf({ stroke: "#e03131", header: { color: "#1971c2", alpha: 100 }, body: { color: "#2f9e44", alpha: 20 } });
  assert.equal(C.stroke, "#e03131");
  assert.equal(C.header, "#1971c2");
  assert.equal(C.headerText, "#ffffff");
  assert.equal(C.cell, "#2f9e4433");
  assert.equal(C.text, "#1e1e1e");
});

test("themes saved by earlier versions are read", () => {
  assert.deepEqual(normalizeTheme({ kind: "color", color: "#1971c2", mode: "fill" }),
    { stroke: mix("#1971c2", "#000000", 0.3), header: { color: "#1971c2", alpha: 100 }, body: { color: mix("#1971c2", "#ffffff", 0.85), alpha: 100 } });
  assert.deepEqual(normalizeTheme({ color: "#1e1e1e", header: "none", body: "none" }),
    { stroke: "#1e1e1e", header: { color: "#ffffff", alpha: 0 }, body: { color: "#ffffff", alpha: 0 } });
  assert.deepEqual(normalizeTheme({ kind: "default" }), DEFAULT_THEME);
  assert.deepEqual(normalizeTheme(null), DEFAULT_THEME);
});

test("same theme", () => {
  assert.ok(sameTheme(null, DEFAULT_THEME));
  assert.ok(sameTheme({ stroke: "#ABC", header: { color: "#fff", alpha: 0 }, body: { color: "#000", alpha: 0 } },
    { stroke: "#abc", header: { color: "#123", alpha: 0 }, body: { color: "#fff", alpha: 0 } }));   // no fill is no fill, whatever colour
  assert.ok(!sameTheme(DEFAULT_THEME, { ...DEFAULT_THEME, header: { color: "#e9ecef", alpha: 50 } }));
});
