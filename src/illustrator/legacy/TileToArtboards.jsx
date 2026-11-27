#target illustrator
/*
  TileToArtboards.jsx
  Splits the selected artwork across a grid of equal-size artboards (for printing
  large patterns/templates in pieces), optionally adds labels, alignment marks and a
  1-inch scale check, and exports one 300 ppi PNG per tile.

  Run: File > Scripts > Other Script... > pick this file.
*/
(function () {
    if (app.documents.length === 0) { alert("Open a document first."); return; }
    var doc = app.activeDocument;
    if (doc.selection.length === 0) {
        alert("Select the artwork to tile first (Select > All), then run the script again.");
        return;
    }
    app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM;

    var PT = 72; // points per inch

    // ---------- bounds of selection ----------
    var L = Infinity, T = -Infinity, R = -Infinity, B = Infinity, i;
    for (i = 0; i < doc.selection.length; i++) {
        var vb = doc.selection[i].visibleBounds; // [left, top, right, bottom]
        if (vb[0] < L) L = vb[0];
        if (vb[1] > T) T = vb[1];
        if (vb[2] > R) R = vb[2];
        if (vb[3] < B) B = vb[3];
    }
    var artW = R - L, artH = T - B;

    // ---------- dialog ----------
    var w = new Window("dialog", "Tile artwork onto artboards");
    w.orientation = "column"; w.alignChildren = "left";
    w.add("statictext", undefined,
        "Artwork size: " + (artW / PT).toFixed(2) + " x " + (artH / PT).toFixed(2) + " in");

    var g = w.add("group"); g.orientation = "column"; g.alignChildren = "left";
    function row(label, val) {
        var r = g.add("group");
        var s = r.add("statictext", undefined, label); s.preferredSize.width = 190;
        var e = r.add("edittext", undefined, val); e.preferredSize.width = 60;
        return e;
    }
    var eW = row("Tile width (in) - printable area:", "7.5");
    var eH = row("Tile height (in) - printable area:", "10");
    var eO = row("Overlap between tiles (in):", "0.5");
    var cLabel = w.add("checkbox", undefined, "Add tile labels (A1, A2, B1...)"); cLabel.value = true;
    var cMarks = w.add("checkbox", undefined, "Add alignment crosses at tile corners"); cMarks.value = true;
    var cScale = w.add("checkbox", undefined, "Add 1-inch scale-check square on first tile"); cScale.value = true;
    var cExport = w.add("checkbox", undefined, "Export one 300 ppi PNG per tile afterward"); cExport.value = true;
    var bg = w.add("group");
    bg.add("button", undefined, "Cancel", { name: "cancel" });
    bg.add("button", undefined, "OK", { name: "ok" });
    if (w.show() !== 1) return;

    var tileW = parseFloat(eW.text) * PT, tileH = parseFloat(eH.text) * PT, ov = parseFloat(eO.text) * PT;
    if (isNaN(tileW) || isNaN(tileH) || isNaN(ov) || tileW <= 0 || tileH <= 0 || ov < 0 ||
        ov >= tileW || ov >= tileH) {
        alert("Please enter valid numbers (overlap must be smaller than the tile size).");
        return;
    }
    var stepX = tileW - ov, stepY = tileH - ov;
    var cols = Math.max(1, Math.ceil((artW - ov) / stepX - 0.0001));
    var rows = Math.max(1, Math.ceil((artH - ov) / stepY - 0.0001));
    var total = cols * rows;
    if (total > 200) { alert("That would make " + total + " tiles. Check your tile size."); return; }
    if (!confirm("This will create " + cols + " x " + rows + " = " + total +
        " artboards and replace the existing artboards. Continue?")) return;

    // ---------- artboards ----------
    function rowName(n) { // 0 -> A, 25 -> Z, 26 -> AA
        var s = ""; n = n + 1;
        while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
        return s;
    }
    var oldCount = doc.artboards.length;
    var tiles = [], r, c;
    for (r = 0; r < rows; r++) {
        for (c = 0; c < cols; c++) {
            var left = L + c * stepX, top = T - r * stepY;
            var ab = doc.artboards.add([left, top, left + tileW, top - tileH]);
            ab.name = rowName(r) + (c + 1);
            tiles.push({ name: ab.name, left: left, top: top });
        }
    }
    for (i = oldCount - 1; i >= 0; i--) doc.artboards[i].remove();

    // ---------- marks layer ----------
    if (cLabel.value || cMarks.value || cScale.value) {
        var layer;
        try { layer = doc.layers.getByName("Tile Marks"); }
        catch (e) { layer = doc.layers.add(); layer.name = "Tile Marks"; }
        layer.locked = false; layer.visible = true;

        var black;
        if (doc.documentColorSpace == DocumentColorSpace.CMYK) {
            black = new CMYKColor(); black.cyan = 0; black.magenta = 0; black.yellow = 0; black.black = 100;
        } else {
            black = new RGBColor(); black.red = 0; black.green = 0; black.blue = 0;
        }
        var line = function (x1, y1, x2, y2) {
            var p = layer.pathItems.add();
            p.setEntirePath([[x1, y1], [x2, y2]]);
            p.filled = false; p.stroked = true; p.strokeWidth = 0.5; p.strokeColor = black;
        };
        var inset = ov > 0 ? ov / 2 : 0.25 * PT;  // with overlap = 2 x inset, neighbours' crosses coincide
        var arm = 0.15 * PT;

        for (i = 0; i < tiles.length; i++) {
            var t = tiles[i], right = t.left + tileW, bottom = t.top - tileH;
            if (cMarks.value) {
                var corners = [[t.left + inset, t.top - inset], [right - inset, t.top - inset],
                               [t.left + inset, bottom + inset], [right - inset, bottom + inset]];
                for (var k = 0; k < 4; k++) {
                    line(corners[k][0] - arm, corners[k][1], corners[k][0] + arm, corners[k][1]);
                    line(corners[k][0], corners[k][1] - arm, corners[k][0], corners[k][1] + arm);
                }
            }
            if (cLabel.value) {
                var tf = layer.textFrames.pointText([t.left + inset + 0.3 * PT, t.top - inset - 0.45 * PT]);
                tf.contents = t.name;
                tf.textRange.characterAttributes.size = 18;
                tf.textRange.characterAttributes.fillColor = black;
            }
        }
        if (cScale.value) {
            var t0 = tiles[0];
            var sx = t0.left + inset + 0.3 * PT, sy = t0.top - tileH + inset + 0.3 * PT + PT;
            var sq = layer.pathItems.rectangle(sy, sx, PT, PT); // top, left, width, height
            sq.filled = false; sq.stroked = true; sq.strokeWidth = 1; sq.strokeColor = black;
            var st = layer.textFrames.pointText([sx + 0.1 * PT, sy - 0.55 * PT]);
            st.contents = "1 in"; st.textRange.characterAttributes.size = 10;
            st.textRange.characterAttributes.fillColor = black;
        }
    }

    // ---------- export ----------
    var msg = "Created " + total + " tiles (" + cols + " across x " + rows + " down).";
    if (cExport.value) {
        var folder = Folder.selectDialog("Choose a folder for the exported PNG tiles");
        if (folder) {
            var opts = new ExportOptionsPNG24();
            opts.artBoardClipping = true;
            opts.saveMultipleArtboards = false;
            opts.horizontalScale = 300 / 72 * 100;  // 300 ppi
            opts.verticalScale = 300 / 72 * 100;
            opts.antiAliasing = true;
            opts.transparency = false;
            var base = "tile";
            // export each artboard to its own file (one-call multi-artboard export overwrites a single file)
            for (var ai = 0; ai < doc.artboards.length; ai++) {
                doc.artboards.setActiveArtboardIndex(ai);
                var abn = doc.artboards[ai].name.replace(/[\\\/:*?"<>|]/g, "");
                doc.exportFile(new File(folder.fsName + "/" + base + " - " + abn + ".png"), ExportType.PNG24, opts);
            }
            msg += "\nExported PNGs to: " + folder.fsName;
        }
    }
    msg += "\n\nEach tile is " + (tileW / PT) + " x " + (tileH / PT) + " in. In Word, set each picture to exactly that size.";
    alert(msg);
})();
