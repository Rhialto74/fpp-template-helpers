// Tests the pure-geometry part of MakeFPPTemplates.jsx (the code between GEO-START and GEO-END).
// Run with:  node --test tests/
// Outside Illustrator the script stops after defining the geometry and exposes it as $GEO.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const PT = 72;
const srcFile = path.join(__dirname, '..', 'src', 'illustrator', 'MakeFPPTemplates.jsx');
const src = fs.readFileSync(srcFile, 'utf8').replace(/^#target.*\n/, '');
// eslint-disable-next-line no-eval
(0, eval)(src);
const G = globalThis.$GEO;

// Fixture: every point of the "Middle Large Dark Blue" (Group B) section, in inches, PDF coordinates.
const items = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'dark-blue-section.json'), 'utf8'));
const pts = [];
items.forEach(o => o.pts.forEach(p => pts.push([p[0] * PT, -p[1] * PT])));
const W = 7 * PT, H = 8.5 * PT, OV = 0.5 * PT, M = 0.06 * PT;

test('geometry is exposed outside Illustrator', () => {
  for (const k of ['convexHull', 'planTiles', 'bestRotation', 'freeSpot', 'clipRect', 'chord']) {
    assert.strictEqual(typeof G[k], 'function', k);
  }
});

test('dark blue section: 8 sheets as drawn, 7 when turned', () => {
  const hull = G.convexHull(pts);
  const rot = G.bestRotation(hull, W, H, OV, M);
  assert.strictEqual(rot.n0, 8);
  assert.strictEqual(rot.n, 7);
  assert.ok(Math.abs(rot.deg) <= 10, 'small turn expected, got ' + rot.deg);
});

test('mirrored section needs the same number of sheets at the opposite angle', () => {
  const hull = G.convexHull(pts);
  const rot = G.bestRotation(hull, W, H, OV, M);
  const mir = pts.map(p => [-p[0], p[1]]);
  const tiles = G.planTiles(G.convexHull(G.rotatePts(mir, -rot.deg)), W, H, OV, M);
  assert.strictEqual(tiles.length, rot.n);
});

test('every sheet (with its glue strips) fits the working area', () => {
  const tiles = G.planTiles(G.convexHull(pts), W, H, OV, M);
  for (const t of tiles) {
    let w = t.rt - t.l, h = t.t - t.b;
    t.joins.forEach(j => { if (j.side === 'right') w = (t.rt - t.l) + OV; else h = (t.t - t.b) + OV; });
    assert.ok(w <= W + 0.01, `${t.name} width ${w / PT}`);
    assert.ok(h <= H + 0.01, `${t.name} height ${h / PT}`);
  }
});

test('joins are recorded once and both sheets agree on the join segment', () => {
  const tiles = G.planTiles(G.convexHull(pts), W, H, OV, M);
  for (const t of tiles) for (const j of t.joins) {
    assert.ok(j.b > j.a, 'join has length');
    assert.ok(tiles.includes(j.other));
    const pa = G.circlePositions(j.a, j.b);
    assert.ok(pa.length >= 1 && pa.length <= 3);
  }
});

test('freeSpot never returns a spot that touches the shape', () => {
  const hull = G.convexHull(pts);
  const tiles = G.planTiles(hull, W, H, OV, M);
  let found = 0;
  for (const t of tiles) {
    const s = G.freeSpot(hull, t.l, t.b, t.rt, t.t, PT, PT, 0.2 * PT, [], 0.12 * PT);
    if (!s) continue;
    found++;
    const box = G.clipRect(hull, s[0] - PT / 2, s[1] - PT / 2, s[0] + PT / 2, s[1] + PT / 2);
    assert.ok(box.length < 3, `${t.name}: 1-inch box overlaps the shape`);
  }
  assert.ok(found >= tiles.length - 2, 'most sheets should have room for the 1-inch box');
});
