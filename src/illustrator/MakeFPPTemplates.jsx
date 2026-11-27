#target illustrator
/*
  MakeFPPTemplates.jsx  -  foundation paper piecing (FPP) template sheets, Left and Right.

  1. Open ONE section file (patch numbers and colour notes typed as normal text). In the dialog,
     say which half of the block the artwork shows as seen on the quilt FRONT.
  2. Select all (Ctrl+A), then File > Scripts > Make FPP Templates (added by Update FPP Helpers),
     or File > Scripts > Other Script... and pick this file.

  Makes a NEW document (your file is not changed) with, for each side:
    - the half the artwork shows: printed as a MIRROR image (FPP is sewn from the printed side,
      so the printed template is the reverse of the finished front). Text is put back to read normally.
    - the other half: printed exactly as drawn.
  For a template with no Left and Right (e.g. a single HST shape), choose "ONE template": it is cut
  up exactly as drawn.
  Each side is split into "Sheet 1 of N" pages with glue strips, matching circles and trim lines,
  plus an assembly map. Exported PNGs go into a folder per side with a sheets.txt list that the
  Word macro (AddTemplateSheets) uses for page titles and sizes.
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

    // Find an empty spot (w x h) on a sheet, away from the edges, the shape and other boxes.
    // Spots nearest a corner are tried first. Returns the spot's centre, or null.
    // margin: one number, or [left, bottom, right, top] (edges with join marks need more room)
    function freeSpot(hull, L, B, R, T, w, h, margin, avoid, pad) {
        var cands = [], step = 0.125 * 72, x, y, k;
        var mg = (margin instanceof Array) ? margin : [margin, margin, margin, margin];
        pad = pad || 0;
        for (x = L + mg[0]; x + w <= R - mg[2] + 0.01; x += step)
            for (y = B + mg[1]; y + h <= T - mg[3] + 0.01; y += step)
                cands.push([x, y, Math.min(x - L, R - x - w) + Math.min(y - B, T - y - h)]);
        cands.sort(function (p, q) { return p[2] - q[2]; });
        for (k = 0; k < cands.length; k++) {
            var bx = cands[k][0], by = cands[k][1], ok = true, j;
            if (clipRect(hull, bx - pad, by - pad, bx + w + pad, by + h + pad).length >= 3) continue;
            for (j = 0; j < avoid.length; j++) {
                var o = avoid[j];
                if (bx < o[2] + pad && bx + w + pad > o[0] && by < o[3] + pad && by + h + pad > o[1]) { ok = false; break; }
            }
            if (ok) return [bx + w / 2, by + h / 2];
        }
        return null;
    }

    if (typeof app === "undefined") { // allows the geometry to be tested outside Illustrator
        $GEO = { convexHull: convexHull, planTiles: planTiles, bestRotation: bestRotation, chord: chord,
                 clipRect: clipRect, centroid: centroid, circlePositions: circlePositions, bounds: bounds,
                 freeSpot: freeSpot, rotatePts: rotatePts };
        return;
    }

    if (app.documents.length === 0) { alert("Open a section file first."); return; }
    var src = app.activeDocument;
    if (src.selection.length === 0) {
        alert("Select the artwork for ONE piecing section first (Ctrl+A), then run the script again.");
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
            // text (patch labels, colour notes) sits inside the shape, and its box can poke past
            // the outline, so it is not used to work out the shape
            return;
        } else {
            var b = item.geometricBounds;
            pts.push([b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]);
        }
    }
    function eachText(item, fn) {
        var t = item.typename, k;
        if (t === "TextFrame") fn(item);
        else if (t === "GroupItem") for (k = item.pageItems.length - 1; k >= 0; k--) eachText(item.pageItems[k], fn);
    }
    var srcPts = [];
    for (i = 0; i < selItems.length; i++) collect(selItems[i], srcPts);
    if (srcPts.length < 3) { alert("Couldn't find any shapes in the selection."); return; }
    var hull0 = convexHull(srcPts), bb0 = bounds(hull0);

    // default section name from the file name, e.g. "Middle Green Group-Left Image.ai" -> "Middle Green Group"
    var defName = src.name.replace(/\.aic?$/i, "").replace(/[\s_-]*label+ed$/i, "")
        .replace(/[\s_-]*gr[ae]y[\s_-]*filled$/i, "").replace(/[\s_-]*(left|right)[\s_-]*image$/i, "")
        .replace(/[\s_-]*(left|right)$/i, "").replace(/^\s+|\s+$/g, "");

    // Settings shared with the Word helper and the updater: one-line UTF-8 files in
    // %APPDATA%\FPP-Template-Helpers (Folder.userData is %APPDATA% on Windows).
    function readSharedSetting(name) {
        var f = new File(Folder.userData.fsName + "/FPP-Template-Helpers/" + name), s = "";
        if (!f.exists) return "";
        f.encoding = "UTF-8";
        if (f.open("r")) { s = f.read(); f.close(); }
        return s.replace(/^﻿/, "").replace(/^\s+|\s+$/g, "");
    }

    // ---------- dialog ----------
    var w = new Window("dialog", "Make FPP template sheets (Left and Right)");
    w.orientation = "column"; w.alignChildren = "left";
    w.add("statictext", undefined, "Selected section: " + ((bb0[2] - bb0[0]) / PT).toFixed(2) + " x " +
        ((bb0[3] - bb0[1]) / PT).toFixed(2) + " in.");
    var g = w.add("group"); g.orientation = "column"; g.alignChildren = "left";
    function row(label, val, width) {
        var r = g.add("group");
        var s = r.add("statictext", undefined, label); s.preferredSize.width = 230;
        var e = r.add("edittext", undefined, val); e.preferredSize.width = width || 60;
        return e;
    }
    var eName = row("Section name (shown on every sheet):", defName, 220);
    var eW = row("Working area width on the page (in):", "7.25");
    var eH = row("Working area height on the page (in):", "8.75");
    var eO = row("Glue strip past each join (in):", "0.5");
    var pS = w.add("panel", undefined, "Seen on the FRONT of the finished quilt, this artwork is the...");
    pS.alignChildren = "left";
    var sRight = pS.add("radiobutton", undefined, "RIGHT half  (Right templates are mirrored, Left print as drawn)"); sRight.value = true;
    var sLeft = pS.add("radiobutton", undefined, "LEFT half  (Left templates are mirrored, Right print as drawn)");
    var sOne = pS.add("radiobutton", undefined, "ONE template, no Left and Right  (printed exactly as drawn)");
    var cLeft = w.add("checkbox", undefined, "Make LEFT templates"); cLeft.value = true;
    var cRight = w.add("checkbox", undefined, "Make RIGHT templates"); cRight.value = true;
    w.add("statictext", undefined, "Patch labels get L on Left sheets and R on Right sheets (A-1 becomes A-1L / A-1R).");
    // Left/Right choices don't apply to a single template
    sRight.onClick = sLeft.onClick = sOne.onClick = function () {
        cLeft.enabled = cRight.enabled = !sOne.value;
    };
    // 1-inch scale graphic: remembered between runs; first time, look next to the section file
    var settingsFile = new File(Folder.userData.fsName + "/MakeFPPTemplates-settings.txt"), inchPath = "";
    if (settingsFile.exists && settingsFile.open("r")) { inchPath = settingsFile.readln(); settingsFile.close(); }
    // look next to the open file first, then in the folder this helper is in
    // (cloud documents have no folder on the computer, so the second place covers them)
    if (!inchPath || !new File(inchPath).exists) {
        try { var guess = new File(src.path.fsName + "/1 Inch.ai"); if (guess.exists) inchPath = guess.fsName; } catch (e) {}
    }
    if (!inchPath || !new File(inchPath).exists) {
        try { var guess2 = new File(new File($.fileName).parent.fsName + "/1 Inch.ai"); if (guess2.exists) inchPath = guess2.fsName; } catch (e3) {}
    }
    var pI = w.add("panel", undefined, "1-inch scale graphic");
    pI.alignChildren = "left";
    var cInch = pI.add("checkbox", undefined, "Add it to every sheet (in an empty spot)"); cInch.value = true;
    var gI = pI.add("group");
    var eInch = gI.add("edittext", undefined, inchPath); eInch.preferredSize.width = 330;
    var bInch = gI.add("button", undefined, "Browse...");
    bInch.onClick = function () { var f = File.openDialog("Choose the 1-inch graphic (.ai)", "*.ai"); if (f) eInch.text = f.fsName; };
    var cExport = w.add("checkbox", undefined, "Export the sheets for Word (300 ppi PNGs) afterward"); cExport.value = true;
    // Output folder: chosen during setup (and with the "Update Output Folder" desktop icon), shared with
    // the Word helper. Changing it here is for this run only.
    var outPath = readSharedSetting("output-folder.txt");
    if (!outPath || !new Folder(outPath).exists) {
        var guessOut = new Folder(Folder.myDocuments.fsName + "/FPP-Template-Helpers/Pattern-Sheets");
        outPath = guessOut.exists ? guessOut.fsName : "";
    }
    var pO = w.add("panel", undefined, "Save the sheets in (a folder for each side is made inside)");
    pO.alignChildren = "left";
    var gO = pO.add("group");
    var eOut = gO.add("edittext", undefined, outPath); eOut.preferredSize.width = 330;
    var bOut = gO.add("button", undefined, "Browse...");
    bOut.onClick = function () {
        var start = new Folder(eOut.text), f;
        f = start.exists ? start.selectDlg("Choose where to save the sheets") : Folder.selectDialog("Choose where to save the sheets");
        if (f) eOut.text = f.fsName;
    };
    pO.add("statictext", undefined, "To change the usual folder, use 'Update Output Folder' on the desktop.");
    cExport.onClick = function () { pO.enabled = cExport.value; };
    var bg = w.add("group");
    bg.add("button", undefined, "Cancel", { name: "cancel" });
    bg.add("button", undefined, "OK", { name: "ok" });
    if (w.show() !== 1) return;

    var secName = eName.text.replace(/^\s+|\s+$/g, "") || "Section";
    var W = parseFloat(eW.text) * PT, H = parseFloat(eH.text) * PT, OV = parseFloat(eO.text) * PT;
    var M = 0.06 * PT;
    if (isNaN(W) || isNaN(H) || isNaN(OV) || W <= 0 || H <= 0 || OV < 0.1 * PT || OV >= W / 2 || OV >= H / 2) {
        alert("Please enter valid numbers. The glue strip must be at least 0.1 in and less than half the working area.");
        return;
    }
    var single = sOne.value;
    if (!single && !cLeft.value && !cRight.value) { alert("Tick Left, Right or both."); return; }
    var outFolder = null;
    if (cExport.value) {
        var outText = eOut.text.replace(/^\s+|\s+$/g, "");
        if (!outText) { alert("Choose where to save the sheets: click Browse... next to 'Save the sheets in'."); return; }
        outFolder = new Folder(outText);
        if (!outFolder.exists && !outFolder.create()) {
            alert("Couldn't make the folder:\n" + outText + "\n\nUse Browse... to pick another one."); return;
        }
    }
    var inchFile = null;
    if (cInch.value) {
        inchFile = new File(eInch.text);
        if (!inchFile.exists) { alert("Couldn't find the 1-inch graphic:\n" + eInch.text + "\n\nUse Browse to pick it, or untick that option."); return; }
        if (settingsFile.open("w")) { settingsFile.writeln(inchFile.fsName); settingsFile.close(); }
    }

    var rot = bestRotation(hull0, W, H, OV, M);
    var angle = 0;
    if (rot.n0 > 60) { alert("This would need " + rot.n0 + " sheets per side. Check the working-area size."); return; }
    var sidesTxt = (!single && cLeft.value && cRight.value) ? " per side" : "";
    if (rot.deg !== 0 && rot.n < rot.n0) {
        if (confirm("As drawn, this section needs " + rot.n0 + " sheets" + sidesTxt + ".\n" +
            "Turned " + rot.deg + " degrees, it needs " + rot.n + " sheets" + sidesTxt + ".\n\nTurn it to save paper?")) angle = rot.deg;
    } else if (!confirm("This section will be split into " + rot.n0 + " sheets" + sidesTxt + ". Continue?")) return;

    // ---------- new document ----------
    app.copy(); // copies the current selection in the original document
    var doc = app.documents.add(src.documentColorSpace, W, H);
    app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
    function mkColor(k) {
        var c;
        if (doc.documentColorSpace == DocumentColorSpace.CMYK) {
            c = new CMYKColor(); c.cyan = 0; c.magenta = 0; c.yellow = 0; c.black = k;
        } else {
            c = new RGBColor(); c.red = c.green = c.blue = Math.round(255 * (1 - k / 100));
        }
        return c;
    }
    var black = mkColor(100), gray = mkColor(60), white = mkColor(0);

    var srcLayer = doc.layers[0]; srcLayer.name = "Section artwork (hidden)";
    doc.activeLayer = srcLayer;
    doc.selection = null;
    try { app.executeMenuCommand("pasteFront"); } catch (e) {}
    if (!doc.selection || doc.selection.length === 0) app.paste();
    if (!doc.selection || doc.selection.length === 0) {
        alert("Couldn't paste the artwork into the new document. Try again.");
        return;
    }
    var pasted = [];
    for (i = 0; i < doc.selection.length; i++) pasted.push(doc.selection[i]);
    var original = srcLayer.groupItems.add(); original.name = "Section as drawn";
    for (i = pasted.length - 1; i >= 0; i--) pasted[i].move(original, ElementPlacement.PLACEATBEGINNING);
    doc.selection = null;

    // bring in the 1-inch graphic the same way (open it, copy, paste into the new document)
    var inchMaster = null, inchW = 0, inchH = 0;
    if (inchFile) {
        var inchDoc = app.open(inchFile);
        app.executeMenuCommand("selectall");
        app.copy();
        inchDoc.close(SaveOptions.DONOTSAVECHANGES);
        doc.activate();
        doc.activeLayer = srcLayer;
        doc.selection = null;
        try { app.executeMenuCommand("pasteFront"); } catch (e) {}
        if (!doc.selection || doc.selection.length === 0) app.paste();
        if (doc.selection && doc.selection.length > 0) {
            var ip = [];
            for (i = 0; i < doc.selection.length; i++) ip.push(doc.selection[i]);
            inchMaster = srcLayer.groupItems.add(); inchMaster.name = "1 inch";
            for (i = ip.length - 1; i >= 0; i--) ip[i].move(inchMaster, ElementPlacement.PLACEATBEGINNING);
            var ib = inchMaster.geometricBounds; inchW = ib[2] - ib[0]; inchH = ib[1] - ib[3];
        }
        doc.selection = null;
    }
    var noInch = [];
    function putInch(parent, cx, cy) {
        var g2 = inchMaster.duplicate(parent, ElementPlacement.PLACEATEND), b2 = g2.geometricBounds;
        g2.translate(cx - (b2[0] + b2[2]) / 2, cy - (b2[1] + b2[3]) / 2);
    }

    function hullOf(item) { var p = []; collect(item, p); return convexHull(p); }

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
    // All text this helper adds uses Gadugi Regular (falls back to Illustrator's default if missing).
    var labelFont = null;
    try { labelFont = app.textFonts.getByName("Gadugi"); } catch (eF) {}
    if (!labelFont) {
        for (var fi = 0; fi < app.textFonts.length; fi++) {
            var tfnt = app.textFonts[fi];
            if (tfnt.family === "Gadugi" && tfnt.style === "Regular") { labelFont = tfnt; break; }
        }
    }
    function text(parent, cx, cy, str, size, rotateDeg, color) {
        var tf = parent.textFrames.pointText([cx, cy]);
        tf.contents = str;
        var ca = tf.textRange.characterAttributes;
        if (labelFont) ca.textFont = labelFont;
        ca.size = size; ca.fillColor = color || black;
        tf.textRange.paragraphAttributes.justification = Justification.CENTER;
        if (rotateDeg) tf.rotate(rotateDeg);
        var b = tf.geometricBounds;
        tf.translate(cx - (b[0] + b[2]) / 2, cy - (b[1] + b[3]) / 2);
        return tf;
    }
    function joinText(len, full, brief) {
        if (len < 0.9 * PT) return "";
        if (len < 3 * PT) return brief;
        return full;
    }

    // ---------- artboard layout: each side gets its own block of rows ----------
    var COLS = 5, GAP = 0.5 * PT, abRow = 0, abCount = 0, exportList = [];
    function nextArtboard(name) {
        var k = abCount, x = (k % COLS) * (W + GAP);
        var rect = [x, -abRow * (H + GAP), x + W, -abRow * (H + GAP) - H];
        var ab = (exportList.length === 0) ? doc.artboards[0] : doc.artboards.add(rect);
        ab.artboardRect = rect; ab.name = name;
        abCount++;
        if (abCount % COLS === 0) abRow++;
        return rect;
    }
    function newSideRow() { if (abCount % COLS !== 0) abRow++; abCount = 0; }

    // Patch numbers look like A-1, B12 or AB-3 (one or two capitals, optional hyphen, 1-3 digits).
    // One already followed by a letter (A-1R) is not a match, so nothing is doubled.
    function addSideLetter(tf, letter) {
        var c = tf.contents, re = /\b([A-Z]{1,2}-?\d{1,3})\b/g, m, ends = [], i, ch;
        while ((m = re.exec(c)) !== null) ends.push(m.index + m[0].length);
        for (i = ends.length - 1; i >= 0; i--) {
            ch = tf.characters[ends[i] - 1];
            ch.contents = ch.contents + letter;
        }
    }

    // ---------- build one side ----------
    // side is "Left", "Right" or "Template" (a single template with no Left/Right).
    function buildSide(side, mirror) {
        var master = original.duplicate(srcLayer, ElementPlacement.PLACEATEND);
        master.name = side + " artwork";
        if (mirror) {
            master.resize(-100, 100);
            // put the text back the right way round so it stays readable
            eachText(master, function (tf) {
                tf.resize(-100, 100, true, true, true, true, 100, Transformation.CENTER);
            });
        }
        // Patch labels say which side they're on: A-1 becomes A-1L / A-1R (not on a single template).
        // The letter is added after the last character of each patch number, so it takes that
        // character's formatting and the rest of the label keeps its own.
        var suffix = side === "Left" ? "L" : (side === "Right" ? "R" : "");
        if (suffix) eachText(master, function (tf) { addSideLetter(tf, suffix); });
        var a = mirror ? -angle : angle;
        if (a) master.rotate(a);
        var hull = hullOf(master);
        var tiles = planTiles(hull, W, H, OV, M);
        if (a && tiles.length > rot.n) { master.rotate(-2 * a); hull = hullOf(master); tiles = planTiles(hull, W, H, OV, M); }
        var bb = bounds(hull), n = tiles.length;
        // e.g. "Group A - Left Template", or "HST - Template" for a single template
        var title = secName + " - " + (side === "Template" ? "" : side + " ") + "Template";

        var layer = doc.layers.add(); layer.name = title;
        newSideRow();

        // assembly map
        var a0 = nextArtboard(side + " 00 Map");
        exportList.push({ side: side, file: "00-Map", title: title + " - Assembly Map",
            sub: "Print every sheet at Actual Size, then use this map to trim and tape them together before cutting out the template." });
        var mapG = layer.groupItems.add(); mapG.name = "Assembly map";
        var pad = 0.5 * PT, titleH = 0.9 * PT;
        var s = Math.min((W - 2 * pad) / (bb[2] - bb[0]), (H - 2 * pad - titleH) / (bb[3] - bb[1]), 1);
        var ox = a0[0] + (W - (bb[2] - bb[0]) * s) / 2, oy = a0[1] - pad - titleH;
        var mx = function (x) { return ox + (x - bb[0]) * s; }, my = function (y) { return oy - (bb[3] - y) * s; };
        var hp = [], k;
        for (k = 0; k < hull.length; k++) hp.push([mx(hull[k][0]), my(hull[k][1])]);
        var hpath = mapG.pathItems.add(); hpath.setEntirePath(hp); hpath.closed = true;
        hpath.filled = true; hpath.fillColor = mkColor(12); hpath.stroked = true; hpath.strokeColor = black; hpath.strokeWidth = 1;
        for (k = 0; k < n; k++) {
            var tt = tiles[k];
            var rr = mapG.pathItems.rectangle(my(tt.t), mx(tt.l), (tt.rt - tt.l) * s, (tt.t - tt.b) * s);
            rr.filled = false; rr.stroked = true; rr.strokeColor = gray; rr.strokeWidth = 0.75; rr.strokeDashes = [3, 2];
            var cp = clipRect(hull, tt.l, tt.b, tt.rt, tt.t), cc = cp.length >= 3 ? centroid(cp) : null;
            if (!cc) cc = [(tt.l + tt.rt) / 2, (tt.t + tt.b) / 2];
            text(mapG, mx(cc[0]), my(cc[1]), "Sheet " + (k + 1), 11, 0);
        }
        text(mapG, a0[0] + W / 2, a0[1] - pad - 0.2 * PT, title + ": how the " + n + " sheets fit together", 13, 0);
        text(mapG, a0[0] + W / 2, a0[1] - pad - 0.55 * PT,
            "Shape outline is simplified. Join the sheets first, then cut out the template.", 8, 0);
        // sheet numbers and joins
        for (k = 0; k < n; k++) { tiles[k].num = k + 1; tiles[k].incoming = []; }
        for (k = 0; k < n; k++)
            for (var j = 0; j < tiles[k].joins.length; j++) {
                var J = tiles[k].joins[j];
                J.other.incoming.push({ other: tiles[k], side: J.side, a: J.a, b: J.b, pos: J.pos });
            }

        for (k = 0; k < n; k++) {
            var t = tiles[k], L = t.l, T = t.t, R = t.rt, B = t.b, RR = R, BB = B, q;
            for (q = 0; q < t.joins.length; q++) {
                if (t.joins[q].side === "right") RR = R + OV;
                if (t.joins[q].side === "bottom") BB = B - OV;
            }
            var part = layer.groupItems.add(); part.name = "Sheet " + t.num;
            var clip = part.groupItems.add();
            master.duplicate(clip, ElementPlacement.PLACEATEND);
            var mask = clip.pathItems.rectangle(T, L, RR - L, T - BB);
            mask.move(clip, ElementPlacement.PLACEATBEGINNING);
            clip.clipped = true;

            var mk = part.groupItems.add(); mk.name = "Join marks";
            var sz = 6.5, inset = OV * 0.55, ps, mid, msg, br, z;
            for (q = 0; q < t.joins.length; q++) {
                var jn = t.joins[q];
                ps = circlePositions(jn.a, jn.b); mid = (jn.a + jn.b) / 2;
                msg = joinText(jn.b - jn.a, "Sheet " + jn.other.num + " goes here - match circles, line up along this edge",
                    "Sheet " + jn.other.num + " here");
                if (jn.side === "right") {
                    line(mk, jn.pos, jn.a, jn.pos, jn.b, true);
                    for (z = 0; z < ps.length; z++) circle(mk, jn.pos, ps[z]);
                    if (msg) text(mk, jn.pos + inset, mid, msg, sz, 90);
                } else {
                    line(mk, jn.a, jn.pos, jn.b, jn.pos, true);
                    for (z = 0; z < ps.length; z++) circle(mk, ps[z], jn.pos);
                    if (msg) text(mk, mid, jn.pos - inset, msg, sz, 0);
                }
            }
            for (q = 0; q < t.incoming.length; q++) {
                var ic = t.incoming[q];
                ps = circlePositions(ic.a, ic.b); mid = (ic.a + ic.b) / 2;
                msg = joinText(ic.b - ic.a, "Trim on this line, lay over Sheet " + ic.other.num + " - match circles",
                    "Trim, lay over Sheet " + ic.other.num);
                if (ic.side === "right") {
                    line(mk, ic.pos, ic.a, ic.pos, ic.b, false, 1);
                    for (z = 0; z < ps.length; z++) circle(mk, ic.pos, ps[z]);
                    if (msg) text(mk, ic.pos + inset, mid, msg, sz, 90);
                } else {
                    line(mk, ic.a, ic.pos, ic.b, ic.pos, false, 1);
                    for (z = 0; z < ps.length; z++) circle(mk, ps[z], ic.pos);
                    if (msg) text(mk, mid, ic.pos - inset, msg, sz, 0);
                }
            }
            // 1-inch graphic and sheet label go in empty spots so they don't sit on the template
            var used = [], gap = 0.12 * PT, big = 0.6 * PT, small = 0.2 * PT;
            var mg = [small, small, small, small]; // left, bottom, right, top
            for (q = 0; q < t.joins.length; q++) { if (t.joins[q].side === "right") mg[2] = big; else mg[1] = big; }
            for (q = 0; q < t.incoming.length; q++) { if (t.incoming[q].side === "right") mg[0] = big; else mg[3] = big; }
            if (inchMaster) {
                var ispot = freeSpot(hull, L, B, R, T, inchW, inchH, mg, used, gap);
                if (ispot) {
                    putInch(mk, ispot[0], ispot[1]);
                    used.push([ispot[0] - inchW / 2, ispot[1] - inchH / 2, ispot[0] + inchW / 2, ispot[1] + inchH / 2]);
                } else noInch.push(side + " sheet " + t.num);
            }
            var lbl = title + "\rSheet " + t.num + " of " + n;
            var spot = freeSpot(hull, L, B, R, T, 2.4 * PT, 0.5 * PT, mg, used, gap);
            if (!spot) {
                var piece = clipRect(hull, L, B, R, T);
                spot = piece.length >= 3 ? centroid(piece) : null;
                if (!spot) spot = [(L + R) / 2, (T + B) / 2];
            }
            text(mk, spot[0], spot[1], lbl, 11, 0, gray);

            var ar = nextArtboard(side + " " + (t.num < 10 ? "0" : "") + t.num);
            var pw = RR - L, ph = T - BB;
            part.translate(ar[0] + (W - pw) / 2 - L, ar[1] - (H - ph) / 2 - T);
            exportList.push({ side: side, file: "Sheet-" + (t.num < 10 ? "0" : "") + t.num,
                title: title + " (Sheet " + t.num + " of " + n + ")",
                sub: "Print at \"Actual Size\" with no scaling. Trim and tape the sheets together using the assembly map, then cut out the template." });
        }
        master.hidden = true;
        return n;
    }

    var made = [];
    var artIsRight = sRight.value;
    if (single) {
        made.push("Template: " + buildSide("Template", false) + " sheets (as drawn)");
    } else {
        if (cLeft.value) made.push("Left: " + buildSide("Left", !artIsRight) + " sheets" + (!artIsRight ? " (mirrored)" : " (as drawn)"));
        if (cRight.value) made.push("Right: " + buildSide("Right", artIsRight) + " sheets" + (artIsRight ? " (mirrored)" : " (as drawn)"));
    }
    srcLayer.visible = false;
    doc.selection = null;

    // ---------- export ----------
    var done = secName + "\n" + made.join("\n") + (made.length > 1 ? "\n(plus an assembly map for each side)" : "\n(plus an assembly map)") +
        (noInch.length ? "\n\nNo empty spot for the 1-inch graphic on: " + noInch.join(", ") +
            ". Place it by hand on those sheets." : "") +
        (angle ? "\nSection turned " + angle + " degrees to save paper." : "") +
        (labelFont ? "" : "\n\nThe Gadugi font isn't installed, so sheet text uses Illustrator's default font.") +
        "\n\nYour original file was not changed.";
    if (cExport.value) {
        var folder = outFolder;
        if (folder) {
            var opts = new ExportOptionsPNG24();
            opts.artBoardClipping = true;
            opts.saveMultipleArtboards = false;
            opts.horizontalScale = 300 / 72 * 100;  // 300 ppi
            opts.verticalScale = 300 / 72 * 100;
            opts.antiAliasing = true;
            opts.transparency = false;
            var clean = secName.replace(/[\\\/:*?"<>|]/g, "");
            var folders = {}, lists = {}, ai;
            for (ai = 0; ai < exportList.length; ai++) {
                var ex = exportList[ai];
                if (!folders[ex.side]) {
                    folders[ex.side] = new Folder(folder.fsName + "/" + clean + " - " + ex.side);
                    if (!folders[ex.side].exists) folders[ex.side].create();
                    lists[ex.side] = ["SIZE\t" + (W / PT) + "\t" + (H / PT)];
                }
                doc.artboards.setActiveArtboardIndex(ai);
                doc.exportFile(new File(folders[ex.side].fsName + "/" + ex.file + ".png"), ExportType.PNG24, opts);
                lists[ex.side].push(ex.file + ".png\t" + ex.title + "\t" + ex.sub);
            }
            for (var sd in lists) {
                var f = new File(folders[sd].fsName + "/sheets.txt");
                f.encoding = "UTF-8"; f.lineFeed = "Windows";
                if (f.open("w")) { f.write(lists[sd].join("\r\n")); f.close(); }
            }
            done += "\n\nSheets saved to:\n";
            for (var sd2 in folders) done += folders[sd2].fsName + "\n";
        }
    }
    done += "\nEvery sheet is " + (W / PT) + " x " + (H / PT) + " in. Save the new document if you want to keep it.";
    alert(done);
})();
