import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareStormAreas, classifyLightning, lightningColors } from "./lightning-colors.ts";

const ring = (a, b) => [[a, a], [b, a], [b, b], [a, b], [a, a]];
const feature = (event, rings = [ring(0, 10)], extra = {}) => ({
  geometry: { type: "Polygon", coordinates: rings }, properties: { event, ...extra },
});
const now = Date.parse("2026-10-16T20:00:00Z");
test("normal white, watch yellow, warning red; warning wins overlap", () => {
  const areas = prepareStormAreas([feature("Tornado Warning"), feature("Severe Thunderstorm Watch")], now);
  assert.equal(classifyLightning(5, 5, areas).level, "warning");
  assert.equal(classifyLightning(15, 15, areas).level, "normal");
  assert.equal(classifyLightning(5, 5, prepareStormAreas([feature("Tornado Watch")], now)).level, "watch");
  assert.deepEqual(lightningColors, { normal: "#ffffff", watch: "#ffd60a", warning: "#ff3030" });
});
test("holes, multipolygons, and polygon edges", () => {
  const holed = prepareStormAreas([feature("Tornado Warning", [ring(0, 10), ring(3, 7)])], now);
  assert.equal(classifyLightning(5, 5, holed).level, "normal");
  assert.equal(classifyLightning(1, 1, holed).level, "warning");
  assert.equal(classifyLightning(0, 5, holed).level, "warning");
  const multi = feature("Severe Thunderstorm Warning");
  multi.geometry = { type: "MultiPolygon", coordinates: [[ring(0, 2)], [ring(10, 12)]] };
  assert.equal(classifyLightning(11, 11, prepareStormAreas([multi], now)).level, "warning");
  assert.equal(classifyLightning(5, 5, prepareStormAreas([multi], now)).level, "normal");
});
test("ignore unrelated, expired, future, or invalid alert areas", () => {
  const areas = prepareStormAreas([
    feature("Freeze Warning"), feature("Flood Warning"),
    feature("Tornado Warning", undefined, { expires: "2026-10-16T19:00:00Z" }),
    feature("Tornado Watch", undefined, { onset: "2026-10-16T21:00:00Z" }),
    feature("Severe Thunderstorm Warning", [[[0, 0]]]),
  ], now);
  assert.equal(areas.length, 0);
});
