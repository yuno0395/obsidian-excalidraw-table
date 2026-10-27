import { test } from "node:test";
import * as assert from "node:assert/strict";
import { Content, Model, TableError, anchors, cellAt, key, minH, pad, scaleModel, structureOps, validModel } from "../src/model";

const ops = structureOps(() => 100, (k) => k);
const model = (nR: number, nC: number, merges: Model["merges"] = []): Model =>
  ({ id: "t", nR, nC, fs: 16, cols: Array(nC).fill(100), rowMin: Array(nR).fill(0), rowH: Array(nR).fill(36), merges });
// content "r,c" in every visible cell
const fill = (M: Model): Content => Object.fromEntries(anchors(M).map((a) => [key(a.r, a.c), { text: key(a.r, a.c), items: [] }]));
const texts = (c: Content) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v.text]));
const sel = (r: number, c: number, rs = 1, cs = 1) => ({ r, c, rs, cs });

test("anchors skip the cells a merge covers", () => {
  const M = model(3, 3, [{ r: 0, c: 0, rs: 2, cs: 2 }]);
  assert.deepEqual(anchors(M).map((a) => key(a.r, a.c)), ["0,0", "0,2", "1,2", "2,0", "2,1", "2,2"]);
  assert.deepEqual(cellAt(M, 1, 1), { r: 0, c: 0, rs: 2, cs: 2 });
  assert.deepEqual(cellAt(M, 2, 2), { r: 2, c: 2, rs: 1, cs: 1 });
  assert.equal(cellAt(M, 3, 0), undefined);
});

test("add row below / above moves content and grows a merge it cuts through", () => {
  let M = model(3, 2, [{ r: 0, c: 0, rs: 2, cs: 1 }]);
  let R = ops.addRow(M, fill(M), [sel(0, 1)]);   // below row 0, inside the merge
  assert.equal(R.M.nR, 4);
  assert.deepEqual(R.M.merges, [{ r: 0, c: 0, rs: 3, cs: 1 }]);
  assert.equal(texts(R.content)["3,1"], "2,1");
  assert.deepEqual(R.focus, { r: 1, c: 1 });
  M = model(2, 2, [{ r: 1, c: 0, rs: 1, cs: 2 }]);
  R = ops.addRowAbove(M, fill(M), [sel(1, 0, 1, 2)]);
  assert.deepEqual(R.M.merges, [{ r: 2, c: 0, rs: 1, cs: 2 }]);
  assert.equal(texts(R.content)["2,0"], "1,0");
});

test("add column uses the column width", () => {
  const M = model(1, 2);
  const R = ops.addColLeft(M, fill(M), [sel(0, 1)]);
  assert.deepEqual(R.M.cols, [100, 100, 100]);
  assert.deepEqual(texts(R.content), { "0,0": "0,0", "0,2": "0,1" });
});

test("delete row on a merged cell deletes every row it covers", () => {
  const M = model(4, 2, [{ r: 1, c: 0, rs: 2, cs: 1 }]);
  const R = ops.delRow(M, fill(M), [sel(1, 0, 2, 1)]);
  assert.equal(R.M.nR, 2);
  assert.deepEqual(R.M.merges, []);
  assert.deepEqual(texts(R.content), { "0,0": "0,0", "0,1": "0,1", "1,0": "3,0", "1,1": "3,1" });
});

test("delete the first row of a merge keeps its content in the rest of the merge", () => {
  const M = model(3, 2, [{ r: 0, c: 0, rs: 3, cs: 1 }]);
  const R = ops.delRow(M, fill(M), [sel(0, 1)]);
  assert.deepEqual(R.M.merges, [{ r: 0, c: 0, rs: 2, cs: 1 }]);
  assert.equal(texts(R.content)["0,0"], "0,0");
});

test("delete column on a merged cell deletes every column it covers; the last one stays", () => {
  let M = model(1, 3, [{ r: 0, c: 0, rs: 1, cs: 2 }]);
  let R = ops.delCol(M, fill(M), [sel(0, 0, 1, 2)]);
  assert.equal(R.M.nC, 1);
  assert.deepEqual(texts(R.content), { "0,0": "0,2" });
  M = model(1, 1);
  R = ops.delCol(M, fill(M), [sel(0, 0)]);
  assert.equal(R.M.nC, 1);
});

test("merge joins texts and grows over a merge it partly covers", () => {
  const M = model(3, 3, [{ r: 1, c: 1, rs: 2, cs: 2 }]);
  const R = ops.merge(M, fill(M), [sel(0, 0), sel(1, 1, 2, 2)]);
  assert.deepEqual(R.M.merges, [{ r: 0, c: 0, rs: 3, cs: 3 }]);
  assert.equal(R.content["0,0"].text, ["0,0", "0,1", "0,2", "1,0", "1,1", "2,0"].join("\n"));
  assert.throws(() => ops.merge(model(1, 2), {}, [sel(0, 0)]), TableError);
});

test("unmerge needs a merged cell", () => {
  const M = model(2, 2, [{ r: 0, c: 0, rs: 2, cs: 2 }]);
  assert.deepEqual(ops.unmerge(M, {}, [sel(0, 0, 2, 2)]).M.merges, []);
  assert.throws(() => ops.unmerge(model(1, 1), {}, [sel(0, 0)]), TableError);
});

test("header toggles", () => {
  const M = model(1, 1);
  assert.equal(ops.toggleHeaderRow(M, {}, []).M.header, false);
  assert.equal(ops.toggleHeaderRow(M, {}, []).M.header, true);
  assert.equal(ops.toggleHeaderCol(M, {}, []).M.headerCol, true);
});

test("scaling the table scales the font and spacing with no lower limit", () => {
  const M = model(2, 2);
  const k = scaleModel(M, 0.01, 0.01);
  assert.equal(k, 0.01);
  assert.ok(Math.abs(M.fs - 0.16) < 1e-9);
  assert.equal(M.base, 16);
  assert.ok(Math.abs(pad(M) - 0.08) < 1e-9);
  assert.ok(Math.abs(minH(M) - 0.36) < 1e-9);
  assert.deepEqual(M.rowMin, [0, 0]);   // rows still follow their (smaller) content
});

test("stretching one way keeps the font; the stretched rows keep their height", () => {
  let M = model(2, 2);
  scaleModel(M, 2, 1);   // wider only
  assert.equal(M.fs, 16);
  assert.deepEqual(M.cols, [200, 200]);
  assert.deepEqual(M.rowMin, [0, 0]);
  M = model(2, 2);
  scaleModel(M, 1, 3);   // taller only
  assert.equal(M.fs, 16);
  assert.deepEqual(M.rowMin, [108, 108]);
  M = model(1, 1);
  scaleModel(M, 0.5, 1);   // narrower: the font shrinks to fit, the row keeps its height
  assert.equal(M.fs, 8);
  assert.deepEqual(M.rowMin, [36]);
});

test("merge keeps the first cell's font size", () => {
  const M = model(1, 2);
  const R = ops.merge(M, { "0,0": { text: "a", items: [], fr: 1.5 }, "0,1": { text: "b", items: [], fr: 0.5 } }, [sel(0, 0), sel(0, 1)]);
  assert.equal(R.content["0,0"].fr, 1.5);
});

test("validModel: a usable model, and broken or oversized ones", () => {
  const ok = { id: "t", nR: 2, nC: 2, fs: 16, cols: [80, 80], rowMin: [0, 0], rowH: [36, 36], merges: [{ r: 0, c: 0, rs: 1, cs: 2 }] };
  assert.ok(validModel(ok));
  assert.ok(!validModel(null));
  assert.ok(!validModel({ ...ok, nR: 1e7, rowH: [], rowMin: [] }));
  assert.ok(!validModel({ ...ok, cols: [80] }));
  assert.ok(!validModel({ ...ok, merges: [{ r: 0, c: 1, rs: 1, cs: 5 }] }));
  assert.ok(!validModel({ ...ok, fs: "16" }));
});
