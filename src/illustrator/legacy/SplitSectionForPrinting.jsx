#target illustrator
/*
  SplitSectionForPrinting.jsx
  For foundation paper piecing (FPP) templates that are larger than the printable area.

  Select the artwork for ONE piecing section (outline, piecing lines, seam-allowance line,
  labels), then run File > Scripts > Other Script... and pick this file.

  The script makes a NEW document (your original file is not changed) with:
    - "00 Assembly map": a small diagram showing how the parts fit together
    - one artboard per printable part, all the same size (the working area of your page)
  Each part shows its slice of the art plus, where it joins a neighbour:
    - a glue strip past the join (art continues into it), marked with a dashed line,
      matching circles and "Part X goes here" text
    - on the neighbour: a solid trim line, the same circles and "trim, lay over Part Y" text
  Rows run from the top (A, B, C...), parts left to right (A1, A2...).
  Diagonal shapes are tiled row by row, so empty pages are skipped. If turning the whole
  section would need fewer pages, the script offers to do that.
*/
(function () {
    var PT = 72;

    // ======================= GEO-START (pure geometry, no Illustrator calls) =================
    function convexHull(pts) {
        var p = pts.slice(0), i;
        p.sort(function (a, b) { return a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]; });
        function cross(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
        var lower = [], upper = [];
        for (i = 0; i < p.length; i++) {
            while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p[i]) <= 0) lower.pop();
            lower.push(p[i]);
        }
        for (i = p.length - 1; i >= 0; i--) {
            while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p[i]) <= 0) upper.pop();
            upper.push(p[i]);
        }
        upper.pop(); lower.pop();
        return lower.concat(upper); // counter-clockwise (y up)
    }
    function bounds(poly) {
        var b = [Infinity, Infinity, -Infinity, -Infinity], i;
        for (i = 0; i < poly.length; i++) {
            if (poly[i][0] < b[0]) b[0] = poly[i][0];
            if (poly[i][1] < b[1]) b[1] = poly[i][1];
            if (poly[i][0] > b[2]) b[2] = poly[i][0];
            if (poly[i][1] > b[3]) b[3] = poly[i][1];
        }
        return b; // minx, miny, maxx, maxy
    }
    // keep the part of a convex polygon where a*x + b*y + c >= 0
    function clipHalf(poly, a, b, c) {
        var out = [], i, n = poly.length;
        for (i = 0; i < n; i++) {
            var P = poly[i], Q = poly[(i + 1) % n];
            var dp = a * P[0] + b * P[1] + c, dq = a * Q[0] + b * Q[1] + c;
            if (dp >= 0) out.push(P);
            if ((dp >= 0) !== (dq >= 0)) {
                var t = dp / (dp - dq);
                out.push([P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])]);
            }
        }
        return out;
    }
    function clipRect(poly, l, b, r, t) {
        poly = clipHalf(poly, 1, 0, -l); if (poly.length < 3) return [];
        poly = clipHalf(poly, -1, 0, r); if (poly.length < 3) return [];
        poly = clipHalf(poly, 0, 1, -b); if (poly.length < 3) return [];
        poly = clipHalf(poly, 0, -1, t); if (poly.length < 3) return [];
        return poly;
    }
    // extent of the polygon along a horizontal (vertical=false) or vertical line
    function chord(poly, v, vertical) {
        var lo = Infinity, hi = -Infinity, i, n = poly.length;
        var A = vertical ? 0 : 1, Bx = vertical ? 1 : 0;
        for (i = 0; i < n; i++) {
            var P = poly[i], Q = poly[(i + 1) % n];
            if ((P[A] - v) * (Q[A] - v) <= 0) {
                var w;
                if (P[A] === Q[A]) {
                    lo = Math.min(lo, P[Bx], Q[Bx]); hi = Math.max(hi, P[Bx], Q[Bx]); continue;
                }
                w = P[Bx] + (v - P[A]) * (Q[Bx] - P[Bx]) / (Q[A] - P[A]);
                if (w < lo) lo = w;
                if (w > hi) hi = w;
            }
        }
        return lo <= hi ? [lo, hi] : null;
    }
    function centroid(poly) {
        var a = 0, cx = 0, cy = 0, i, n = poly.length;
        for (i = 0; i < n; i++) {
            var P = poly[i], Q = poly[(i + 1) % n], f = P[0] * Q[1] - Q[0] * P[1];
            a += f; cx += (P[0] + Q[0]) * f; cy += (P[1] + Q[1]) * f;
        }
        if (Math.abs(a) < 1e-9) return null;
        return [cx / (3 * a), cy / (3 * a)];
    }
    function rotatePts(pts, deg) {
        var r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), out = [], i;
        for (i = 0; i < pts.length; i++) out.push([pts[i][0] * c - pts[i][1] * s, pts[i][0] * s + pts[i][1] * c]);
        return out;
    }
    function rowName(n) {
        var s = ""; n = n + 1;
        while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
        return s;
    }
    // Tile a convex hull row by row. W,H = largest printable part, ov = glue strip, m = margin.
    // Several row layouts are tried (even rows, rows from the top, rows from the bottom);
    // the one with the fewest parts wins. Columns in each row are spread evenly.
    function planTiles(hull, W, H, ov, m) {
        var best = null, mode;
        for (mode = 0; mode < 3; mode++) {
            var p = planTilesMode(hull, W, H, ov, m, mode);
            if (!best || p.length < best.length) best = p;
        }
        return best;
    }
    function planTilesMode(hull, W, H, ov, m, mode) {
        var sx = W - ov, sy = H - ov, bb = bounds(hull), tiles = [], rows = [];
        var top0 = bb[3] + m, totalH = (bb[3] - bb[1]) + 2 * m;
        var nr = Math.max(1, Math.ceil(totalH / sy - 1e-9)), r, bands = [];
        for (r = 0; r < nr; r++) {
            if (mode === 0) bands.push([top0 - r * totalH / nr, top0 - (r + 1) * totalH / nr]);
            else if (mode === 1) bands.push([top0 - r * sy, Math.max(top0 - (r + 1) * sy, top0 - totalH)]);
            else { var b0 = top0 - totalH; bands.unshift([Math.min(b0 + (r + 1) * sy, top0), b0 + r * sy]); }
        }
        for (r = 0; r < bands.length; r++) {
            var top = bands[r][0], bot = bands[r][1];
            var band = clipRect(hull, bb[0] - 10, bot, bb[2] + 10, top);
            var row = [];
            if (band.length >= 3) {
                var eb = bounds(band), x0 = eb[0] - m, wd = (eb[2] - eb[0]) + 2 * m;
                var nc = Math.max(1, Math.ceil(wd / sx - 1e-9)), cw = wd / nc, c;
                for (c = 0; c < nc; c++) {
                    var t = { r: rows.length, c: c, l: x0 + c * cw, rt: x0 + (c + 1) * cw, t: top, b: bot };
                    tiles.push(t); row.push(t);
                }
            }
            if (row.length) rows.push(row);
        }
        for (r = 0; r < rows.length; r++)
            for (var cc = 0; cc < rows[r].length; cc++) rows[r][cc].name = rowName(r) + (cc + 1);
        // joins: right neighbours in the same row, and neighbours in the row below
        var i, j;
        for (i = 0; i < tiles.length; i++) { tiles[i].joins = []; }
        for (i = 0; i < rows.length; i++) {
            var rw = rows[i];
            for (j = 0; j < rw.length - 1; j++) {
                var A = rw[j], B = rw[j + 1], ch = chord(hull, A.rt, true);
                if (!ch) continue;
                var y0 = Math.max(ch[0], A.b), y1 = Math.min(ch[1], A.t);
                if (y1 - y0 > 0.05 * PT) A.joins.push({ other: B, side: "right", a: y0, b: y1, pos: A.rt });
            }
            if (i + 1 < rows.length) {
                for (j = 0; j < rw.length; j++) {
                    var U = rw[j], k, below = rows[i + 1], chh = chord(hull, U.b, false);
                    if (!chh) continue;
                    for (k = 0; k < below.length; k++) {
                        var D = below[k];
                        var x0 = Math.max(U.l, D.l, chh[0]), x1 = Math.min(U.rt, D.rt, chh[1]);
                        if (x1 - x0 > 0.05 * PT) U.joins.push({ other: D, side: "bottom", a: x0, b: x1, pos: U.b });
                    }
                }
            }
        }
        return tiles;
    }
    function bestRotation(hull0, W, H, ov, m) {
        var best = { deg: 0, n: planTiles(hull0, W, H, ov, m).length }, d;
        var n0 = best.n;
        for (d = 1; d < 180; d++) {
            var n = planTiles(convexHull(rotatePts(hull0, d)), W, H, ov, m).length;
            if (n < best.n) best = { deg: d, n: n };
        }
        best.n0 = n0;
        return best;
    }
    function circlePositions(a, b) {
        var L = b - a;
        if (L < 1.2 * PT) return [a + L / 2];
        if (L > 6 * PT) return [a + 0.15 * L, a + 0.5 * L, a + 0.85 * L];
        return [a + 0.2 * L, a + 0.8 * L];
    }
    // ======================= GEO-END ==========================================================

    if (typeof app === "undefined") { // allows the geometry to be tested outside Illustrator
        $GEO = { convexHull: convexHull, planTiles: planTiles, bestRotation: bestRotation, chord: chord,
                 clipRect: clipRect, centroid: centroid, circlePositions: circlePositions, bounds: bounds };
        return;
    }

    if (app.documents.length === 0) { alert("Open a document first."); return; }
    var src = app.activeDocument;
    if (src.selection.length === 0) {
        alert("Select the artwork for ONE piecing section first (outline, piecing lines, seam allowance, labels), then run the script again.");
        return;
    }
    app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM;

    var selItems = [], i;
    for (i = 0; i < src.selection.length; i++) selItems.push(src.selection[i]);

    function collect(item, pts) {
        try { if (item.hidden || item.guides) return; } catch (e) {}
        var t = item.typename, k;
        if (t === "PathItem") {
            var pp = item.pathPoints;
            // ignore leftovers that print nothing: stray single points and paths with no stroke or fill
            if (pp.length < 2) return;
            try { if (!item.stroked && !item.filled && !item.clipping) return; } catch (e2) {}
            for (k = 0; k < pp.length; k++) {
                pts.push(pp[k].anchor); pts.push(pp[k].leftDirection); pts.push(pp[k].rightDirection);
            }
        } else if (t === "CompoundPathItem") {
            for (k = 0; k < item.pathItems.length; k++) collect(item.pathItems[k], pts);
        } else if (t === "GroupItem") {
            for (k = 0; k < item.pageItems.length; k++) collect(item.pageItems[k], pts);
        } else if (t === "TextFrame") {
            if (!item.contents || /^\s*$/.test(item.contents)) return; // empty text box
            var tb = item.geometricBounds;
            pts.push([tb[0], tb[1]], [tb[2], tb[1]], [tb[2], tb[3]], [tb[0], tb[3]]);
        } else {
            var b = item.geometricBounds;
            pts.push([b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]);
        }
    }
    var srcPts = [];
    for (i = 0; i < selItems.length; i++) collect(selItems[i], srcPts);
    if (srcPts.length < 3) { alert("Couldn't find any shapes in the selection."); return; }
    var hull0 = convexHull(srcPts), bb0 = bounds(hull0);

    // ---------- dialog ----------
    var w = new Window("dialog", "Split section for printing");
    w.orientation = "column"; w.alignChildren = "left";
    w.add("statictext", undefined, "Selected section: " + ((bb0[2] - bb0[0]) / PT).toFixed(2) + " x " +
        ((bb0[3] - bb0[1]) / PT).toFixed(2) + " in");
    var g = w.add("group"); g.orientation = "column"; g.alignChildren = "left";
    function row(label, val, width) {
        var r = g.add("group");
        var s = r.add("statictext", undefined, label); s.preferredSize.width = 230;
        var e = r.add("edittext", undefined, val); e.preferredSize.width = width || 60;
        return e;
    }
    var eName = row("Section name (shown on every part):", "", 170);
    var eW = row("Working area width on the page (in):", "7");
    var eH = row("Working area height on the page (in):", "8.5");
    var eO = row("Glue strip past each join (in):", "0.5");
    var cExport = w.add("checkbox", undefined, "Export one 300 ppi PNG per artboard afterward"); cExport.value = true;
    var bg = w.add("group");
    bg.add("button", undefined, "Cancel", { name: "cancel" });
    bg.add("button", undefined, "OK", { name: "ok" });
    if (w.show() !== 1) return;

    var secName = eName.text.replace(/^\s+|\s+$/g, "");
    var W = parseFloat(eW.text) * PT, H = parseFloat(eH.text) * PT, OV = parseFloat(eO.text) * PT;
    var M = 0.06 * PT; // small margin so strokes at the edge aren't cut off
    if (isNaN(W) || isNaN(H) || isNaN(OV) || W <= 0 || H <= 0 || OV < 0.1 * PT || OV >= W / 2 || OV >= H / 2) {
        alert("Please enter valid numbers. The glue strip must be at least 0.1 in and less than half the working area.");
        return;
    }

    var rot = bestRotation(hull0, W, H, OV, M);
    var angle = 0;
    if (rot.n0 > 60) { alert("This would need " + rot.n0 + " pages. Check the working-area size."); return; }
    if (rot.deg !== 0 && rot.n < rot.n0) {
        if (confirm("As drawn, this section needs " + rot.n0 + " pages.\n" +
            "Turned " + rot.deg + " degrees, it needs " + rot.n + " pages.\n\nTurn it to save pages?")) angle = rot.deg;
    } else if (!confirm("This section will be split into " + rot.n0 + " parts. Continue?")) return;

    // ---------- new document ----------
    app.copy(); // copies the current selection in the original document
    var doc = app.documents.add(src.documentColorSpace, W, H);
    app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
    var black, gray, white;
    function mkColor(k) {
        var c;
        if (doc.documentColorSpace == DocumentColorSpace.CMYK) {
            c = new CMYKColor(); c.cyan = 0; c.magenta = 0; c.yellow = 0; c.black = k;
        } else {
            c = new RGBColor(); c.red = c.green = c.blue = Math.round(255 * (1 - k / 100));
        }
        return c;
    }
    black = mkColor(100); gray = mkColor(60); white = mkColor(0);

    var srcLayer = doc.layers[0]; srcLayer.name = "Section artwork (hidden)";
    var partsLayer = doc.layers.add(); partsLayer.name = "Printable parts";

    // bring the selected artwork over with Copy + Paste in Place (scripted cross-document copying is unreliable)
    doc.activeLayer = srcLayer;
    doc.selection = null;
    try { app.executeMenuCommand("pasteFront"); } catch (e) {}
    if (!doc.selection || doc.selection.length === 0) app.paste();
    if (!doc.selection || doc.selection.length === 0) {
        alert("Couldn't paste the artwork into the new document. Copy it manually (Ctrl+C) and try again.");
        return;
    }
    var pasted = [];
    for (i = 0; i < doc.selection.length; i++) pasted.push(doc.selection[i]);
    var master = srcLayer.groupItems.add(); master.name = "Section";
    for (i = pasted.length - 1; i >= 0; i--) pasted[i].move(master, ElementPlacement.PLACEATBEGINNING);
    doc.selection = null;

    function hullOf(item) { var p = []; collect(item, p); return convexHull(p); }
    if (angle) master.rotate(angle);
    var hull = hullOf(master);
    var tiles = planTiles(hull, W, H, OV, M);
    if (angle && tiles.length > rot.n) { // rotated the wrong way: flip
        master.rotate(-2 * angle);
        hull = hullOf(master); tiles = planTiles(hull, W, H, OV, M);
    }
    var bb = bounds(hull);

    // ---------- drawing helpers ----------
    function line(parent, x1, y1, x2, y2, dashed, weight) {
        var p = parent.pathItems.add();
        p.setEntirePath([[x1, y1], [x2, y2]]);
        p.filled = false; p.stroked = true; p.strokeColor = black; p.strokeWidth = weight || 0.75;
        if (dashed) p.strokeDashes = [4, 3];
        return p;
    }
    function circle(parent, x, y) {
        var d = 0.16 * PT, c = parent.pathItems.ellipse(y + d / 2, x - d / 2, d, d);
        c.filled = true; c.fillColor = white; c.stroked = true; c.strokeColor = black; c.strokeWidth = 0.75;
    }
    function text(parent, cx, cy, str, size, rotateDeg, color) {
        var tf = parent.textFrames.pointText([cx, cy]);
        tf.contents = str;
        var ca = tf.textRange.characterAttributes;
        ca.size = size; ca.fillColor = color || black;
        tf.textRange.paragraphAttributes.justification = Justification.CENTER;
        if (rotateDeg) tf.rotate(rotateDeg);
        var b = tf.geometricBounds;
        tf.translate(cx - (b[0] + b[2]) / 2, cy - (b[1] + b[3]) / 2);
        return tf;
    }
    var labelPrefix = secName ? secName + " - " : "";
    // short joins get short text (or none) so labels don't overlap or run off the part
    function joinText(len, full, brief) {
        if (len < 0.9 * PT) return "";
        if (len < 3 * PT) return brief;
        return full;
    }

    // ---------- artboards ----------
    var COLS = 5, GAP = 0.5 * PT;
    function abRect(k) {
        var x = (k % COLS) * (W + GAP), y = -Math.floor(k / COLS) * (H + GAP);
        return [x, y, x + W, y - H];
    }
    doc.artboards[0].artboardRect = abRect(0);
    doc.artboards[0].name = "00 Assembly map";
    for (i = 0; i < tiles.length; i++) {
        var ab = doc.artboards.add(abRect(i + 1));
        ab.name = (secName ? secName + " " : "") + tiles[i].name;
    }

    // which joins land on each tile (as the part laid on top)
    for (i = 0; i < tiles.length; i++) tiles[i].incoming = [];
    for (i = 0; i < tiles.length; i++) {
        for (var j = 0; j < tiles[i].joins.length; j++) {
            var J = tiles[i].joins[j];
            J.other.incoming.push({ other: tiles[i], side: J.side, a: J.a, b: J.b, pos: J.pos });
        }
    }

    // ---------- parts ----------
    for (i = 0; i < tiles.length; i++) {
        var t = tiles[i], L = t.l, T = t.t, R = t.rt, B = t.b, RR = R, BB = B, k;
        for (k = 0; k < t.joins.length; k++) {
            if (t.joins[k].side === "right") RR = R + OV;
            if (t.joins[k].side === "bottom") BB = B - OV;
        }
        var part = partsLayer.groupItems.add(); part.name = "Part " + t.name;
        var clip = part.groupItems.add();
        master.duplicate(clip, ElementPlacement.PLACEATEND);
        var mask = clip.pathItems.rectangle(T, L, RR - L, T - BB);
        mask.move(clip, ElementPlacement.PLACEATBEGINNING);
        clip.clipped = true;

        var mk = part.groupItems.add(); mk.name = "Join marks";
        var sz = 6.5, inset = OV * 0.55, pc, q;
        // this part carries the glue strip; the neighbour lies on top of it
        for (k = 0; k < t.joins.length; k++) {
            var jn = t.joins[k], ps = circlePositions(jn.a, jn.b), mid = (jn.a + jn.b) / 2;
            var msg = labelPrefix + "Part " + jn.other.name + " - match circles, line up along this edge";
            if (jn.side === "right") {
                line(mk, jn.pos, jn.a, jn.pos, jn.b, true);
                for (q = 0; q < ps.length; q++) circle(mk, jn.pos, ps[q]);
                if (joinText(jn.b - jn.a, msg, "Part " + jn.other.name)) text(mk, jn.pos + inset, mid, joinText(jn.b - jn.a, msg, "Part " + jn.other.name), sz, 90);
            } else {
                line(mk, jn.a, jn.pos, jn.b, jn.pos, true);
                for (q = 0; q < ps.length; q++) circle(mk, ps[q], jn.pos);
                if (joinText(jn.b - jn.a, msg, "Part " + jn.other.name)) text(mk, mid, jn.pos - inset, joinText(jn.b - jn.a, msg, "Part " + jn.other.name), sz, 0);
            }
        }
        // this part is laid on top of a neighbour's glue strip: trim along the solid line
        for (k = 0; k < t.incoming.length; k++) {
            var ic = t.incoming[k], ps2 = circlePositions(ic.a, ic.b), mid2 = (ic.a + ic.b) / 2;
            var msg2 = "Trim on this line, lay over " + labelPrefix + "Part " + ic.other.name + " - match circles";
            if (ic.side === "right") { // the edge is this part's left edge
                line(mk, ic.pos, ic.a, ic.pos, ic.b, false, 1);
                for (q = 0; q < ps2.length; q++) circle(mk, ic.pos, ps2[q]);
                if (joinText(ic.b - ic.a, msg2, "Trim, over " + ic.other.name)) text(mk, ic.pos + inset, mid2, joinText(ic.b - ic.a, msg2, "Trim, over " + ic.other.name), sz, 90);
            } else { // this part's top edge
                line(mk, ic.a, ic.pos, ic.b, ic.pos, false, 1);
                for (q = 0; q < ps2.length; q++) circle(mk, ps2[q], ic.pos);
                if (joinText(ic.b - ic.a, msg2, "Trim, over " + ic.other.name)) text(mk, mid2, ic.pos - inset, joinText(ic.b - ic.a, msg2, "Trim, over " + ic.other.name), sz, 0);
            }
        }
        // part label near the middle of the art on this part
        var piece = clipRect(hull, L, B, R, T);
        pc = piece.length >= 3 ? centroid(piece) : null;
        if (!pc) pc = [(L + R) / 2, (T + B) / 2];
        text(mk, pc[0], pc[1] + 9, (secName ? secName + "\r" : "") + "Part " + t.name, 14, 0);

        // move the part onto its artboard, centred
        var ar = abRect(i + 1), pw = RR - L, ph = T - BB;
        part.translate(ar[0] + (W - pw) / 2 - L, ar[1] - (H - ph) / 2 - T);
    }

    // ---------- assembly map ----------
    var mapG = partsLayer.groupItems.add(); mapG.name = "Assembly map";
    var a0 = abRect(0), pad = 0.5 * PT, titleH = 0.9 * PT;
    var s = Math.min((W - 2 * pad) / (bb[2] - bb[0]), (H - 2 * pad - titleH) / (bb[3] - bb[1]), 1);
    var ox = a0[0] + (W - (bb[2] - bb[0]) * s) / 2, oy = a0[1] - pad - titleH;
    function mx(x) { return ox + (x - bb[0]) * s; }
    function my(y) { return oy - (bb[3] - y) * s; }
    var hp = [];
    for (i = 0; i < hull.length; i++) hp.push([mx(hull[i][0]), my(hull[i][1])]);
    var hpath = mapG.pathItems.add(); hpath.setEntirePath(hp); hpath.closed = true;
    hpath.filled = true; hpath.fillColor = mkColor(12); hpath.stroked = true; hpath.strokeColor = black; hpath.strokeWidth = 1;
    for (i = 0; i < tiles.length; i++) {
        var tt = tiles[i];
        var rr = mapG.pathItems.rectangle(my(tt.t), mx(tt.l), (tt.rt - tt.l) * s, (tt.t - tt.b) * s);
        rr.filled = false; rr.stroked = true; rr.strokeColor = gray; rr.strokeWidth = 0.75; rr.strokeDashes = [3, 2];
        var cp = clipRect(hull, tt.l, tt.b, tt.rt, tt.t), cc = cp.length >= 3 ? centroid(cp) : null;
        if (!cc) cc = [(tt.l + tt.rt) / 2, (tt.t + tt.b) / 2];
        text(mapG, mx(cc[0]), my(cc[1]), tt.name, 12, 0);
    }
    text(mapG, a0[0] + W / 2, a0[1] - pad - 0.2 * PT, (secName ? secName + " - " : "") + "Assembly map (" + tiles.length + " parts)", 14, 0);
    text(mapG, a0[0] + W / 2, a0[1] - pad - 0.55 * PT,
        "Shape outline is simplified. Join the parts first, then cut out the template.", 8, 0);

    srcLayer.visible = false;
    doc.selection = null;

    // ---------- export ----------
    var done = "Made " + tiles.length + " parts plus an assembly map in a new document" +
        (angle ? " (section turned " + angle + " degrees)" : "") + ".\nYour original file was not changed.";
    if (cExport.value) {
        var folder = Folder.selectDialog("Choose a folder for the exported PNG files");
        if (folder) {
            var opts = new ExportOptionsPNG24();
            opts.artBoardClipping = true;
            opts.saveMultipleArtboards = false;
            opts.horizontalScale = 300 / 72 * 100;  // 300 ppi
            opts.verticalScale = 300 / 72 * 100;
            opts.antiAliasing = true;
            opts.transparency = false;
            var base = (secName ? secName.replace(/[\\\/:*?"<>|]/g, "") : "section");
            // export each artboard to its own file (one-call multi-artboard export overwrites a single file)
            for (var ai = 0; ai < doc.artboards.length; ai++) {
                doc.artboards.setActiveArtboardIndex(ai);
                var abn = doc.artboards[ai].name.replace(/[\\\/:*?"<>|]/g, "");
                var fname = abn.indexOf(base) === 0 ? abn : base + " - " + abn;
                doc.exportFile(new File(folder.fsName + "/" + fname + ".png"), ExportType.PNG24, opts);
            }
            done += "\nPNG files saved to: " + folder.fsName;
        }
    }
    done += "\n\nEvery artboard is " + (W / PT) + " x " + (H / PT) + " in. Save the new document if you want to keep it.";
    alert(done);
})();
