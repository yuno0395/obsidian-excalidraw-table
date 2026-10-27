import { test } from "node:test";
import * as assert from "node:assert/strict";
import { stacked } from "../src/table";

const cell = (id: string) => ({ id, type: "rectangle", customData: { exTable: { id: "T", r: 0, c: 0 } } });
const text = (id: string, containerId: string) => ({ id, type: "text", containerId });
const img = (id: string) => ({ id, type: "image", customData: { exTable: { id: "T", r: 0, c: 0 } } });
const shape = (id: string, type = "arrow") => ({ id, type });
const ids = (els: any[]) => els.map((e) => e.id).join(" ");

test("images go just above the cells, not above shapes drawn over the table", () => {
  const els = [shape("bg", "rectangle"), cell("c1"), text("t1", "c1"), shape("arrow"), img("i1"), shape("label", "text")];
  // the arrow was between the cells and the image: the image comes down to the cells, the arrow stays on top of it
  assert.equal(ids(stacked(els, "T")), "bg c1 t1 i1 arrow label");
});

test("an image left on top of everything (by earlier versions) comes back down to its table", () => {
  const els = [cell("c1"), text("t1", "c1"), shape("arrow"), img("i1")];
  assert.equal(ids(stacked(els, "T")), "c1 t1 i1 arrow");
});

test("a rebuilt table goes back to its place: above `after`, or at the bottom", () => {
  const els = [shape("bg", "rectangle"), shape("arrow"), cell("c2"), text("t2", "c2"), img("i1")];
  assert.equal(ids(stacked(els, "T", "bg")), "bg c2 t2 i1 arrow");
  assert.equal(ids(stacked(els, "T", null)), "c2 t2 i1 bg arrow");
  assert.equal(ids(stacked(els, "T", "gone")), "bg arrow c2 t2 i1");   // unknown element: stays where it is
});

test("a table already in order is left as it is", () => {
  const els = [shape("a"), cell("c1"), text("t1", "c1"), cell("c2"), img("i1"), shape("b")];
  assert.equal(ids(stacked(els, "T")), ids(els));
});

test("an arrow or text left behind the table (by earlier versions) comes back on top of the image it is on", () => {
  const im = { ...img("i1"), x: 0, y: 0, width: 100, height: 60 };
  const tiedArrow = { ...shape("a1"), x: 500, y: 500, width: 10, height: 10, endBinding: { elementId: "i1" } };
  const label = { id: "lb", type: "text", x: 40, y: 20, width: 20, height: 10 };
  const background = { id: "bg", type: "rectangle", x: -10, y: -10, width: 300, height: 200 };
  const els = [background, tiedArrow, label, cell("c1"), text("t1", "c1"), im, shape("top")];
  assert.equal(ids(stacked(els, "T")), "bg c1 t1 i1 a1 lb top");
});
