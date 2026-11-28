#target illustrator
// Add Fabric Swatches - turns a folder of fabric pictures (JPG, PNG, TIF) into pattern swatches in the
// open Illustrator document, one swatch per picture, named after the file ("Kona Red 1308.jpg" ->
// swatch "Kona Red 1308"). Fill any shape with a swatch to see the fabric repeat.
//
// Menu: File > Scripts > Add Fabric Swatches (the updater puts a small launcher there).
//
// How: Illustrator's scripting can't put artwork into a pattern directly (doc.patterns.add() gives an
// empty pattern and duplicating art into it fails with Error 1266). So each picture is placed, embedded,
// selected and turned into a pattern with Object > Pattern > Make ("Adobe Make Pattern"), and pattern
// editing mode is left with "exitFocus". Alerts are switched off meanwhile, otherwise Illustrator stops
// on "The new pattern has been added to the Swatches panel" for every picture.
//
// Outside Illustrator (Node tests) only the pure helpers below are defined, exposed as $FABRIC.

(function () {
    // ======================= PURE-START (no Illustrator calls) =================================
    var PICTURE = /\.(jpe?g|png|tiff?)$/i;

    function isPicture(name) { return PICTURE.test(name); }

    // "Kona%20Red%201308.jpg" or "Kona Red 1308.jpg" -> "Kona Red 1308"
    function swatchName(fileName) {
        var n = fileName;
        try { n = decodeURI(n); } catch (e) { }
        n = n.replace(/\.[^\.]+$/, "");
        return n.replace(/^\s+|\s+$/g, "");
    }

    // Tile width in inches from what she typed: "2", "2.5", "2,5", " 3 in" -> number; else null.
    function parseInches(text) {
        var t = String(text).replace(/^\s+|\s+$/g, "").replace(/\s*(in|inch|inches|")$/i, "").replace(",", ".");
        if (!/^\d*\.?\d+$/.test(t)) return null;
        var v = parseFloat(t);
        return (v > 0 && v <= 100) ? v : null;
    }

    // Settings file: one "key=value" per line.
    function parseSettings(text) {
        var out = {}, lines = String(text).split(/\r?\n/), i, k;
        for (i = 0; i < lines.length; i++) {
            k = lines[i].indexOf("=");
            if (k > 0) out[lines[i].substring(0, k)] = lines[i].substring(k + 1);
        }
        return out;
    }

    function formatSettings(obj) {
        var s = "", k;
        for (k in obj) if (obj.hasOwnProperty(k)) s += k + "=" + obj[k] + "\n";
        return s;
    }

    // Picture file names -> [{file, name}] to make, plus names skipped because a swatch already has them
    // (or an earlier picture in the folder had the same name, e.g. "Red.jpg" and "Red.png").
    function planSwatches(fileNames, existing) {
        var taken = {}, make = [], skipped = [], i, n;
        for (i = 0; i < existing.length; i++) taken[existing[i].toLowerCase()] = true;
        for (i = 0; i < fileNames.length; i++) {
            if (!isPicture(fileNames[i])) continue;
            n = swatchName(fileNames[i]);
            if (n === "") continue;
            if (taken[n.toLowerCase()]) { skipped.push(n); continue; }
            taken[n.toLowerCase()] = true;
            make.push({ file: fileNames[i], name: n });
        }
        return { make: make, skipped: skipped };
    }

    // List names for the closing message, at most max of them.
    function listNames(names, max) {
        if (names.length <= max) return names.join("\n");
        return names.slice(0, max).join("\n") + "\n... and " + (names.length - max) + " more";
    }
    // ======================= PURE-END ==========================================================

    if (typeof app === "undefined") {
        $FABRIC = { isPicture: isPicture, swatchName: swatchName, parseInches: parseInches,
            parseSettings: parseSettings, formatSettings: formatSettings, planSwatches: planSwatches,
            listNames: listNames };
        return;
    }

    // ---------- settings (remembered between runs) ----------
    var settingsFile = new File(Folder.userData.fsName + "/FPP-Template-Helpers/fabric-swatches.txt");

    function readText(f) {
        var s = "";
        if (f.exists) { f.encoding = "UTF-8"; if (f.open("r")) { s = f.read(); f.close(); } }
        return s;
    }

    function saveSettings(obj) {
        try {
            if (!settingsFile.parent.exists) settingsFile.parent.create();
            settingsFile.encoding = "UTF-8";
            if (settingsFile.open("w")) { settingsFile.write(formatSettings(obj)); settingsFile.close(); }
        } catch (e) { }   // not worth stopping for
    }

    var settings = parseSettings(readText(settingsFile));
    var startFolder = settings.folder || "";
    if (startFolder === "" || !new Folder(startFolder).exists) startFolder = Folder.myDocuments.fsName;

    function pictureNames(folder) {
        var all = folder.getFiles(), names = [], i;
        for (i = 0; i < all.length; i++) if (all[i] instanceof File && isPicture(all[i].name)) names.push(all[i].name);
        names.sort(function (a, b) { a = swatchName(a).toLowerCase(); b = swatchName(b).toLowerCase(); return a < b ? -1 : (a > b ? 1 : 0); });
        return names;
    }

    // ---------- dialog ----------
    var dlg = new Window("dialog", "Add fabric swatches");
    dlg.orientation = "column";
    dlg.alignChildren = "fill";

    var pF = dlg.add("panel", undefined, "Folder of fabric pictures (JPG, PNG or TIF)");
    pF.alignChildren = "left";
    var gF = pF.add("group");
    var eFolder = gF.add("edittext", undefined, startFolder);
    eFolder.characters = 46;
    var bBrowse = gF.add("button", undefined, "Browse...");
    var tCount = pF.add("statictext", undefined, "", { multiline: false });
    tCount.characters = 50;

    var pS = dlg.add("panel", undefined, "Size of each fabric tile");
    pS.alignChildren = "left";
    var rAsIs = pS.add("radiobutton", undefined, "Keep each picture's own size");
    var gW = pS.add("group");
    var rWidth = gW.add("radiobutton", undefined, "Make each tile");
    var eWidth = gW.add("edittext", undefined, settings.width || "2");
    eWidth.characters = 5;
    gW.add("statictext", undefined, "inches wide (height follows)");
    if (settings.sizeMode === "width") rWidth.value = true; else rAsIs.value = true;
    rAsIs.onClick = function () { rWidth.value = false; eWidth.enabled = false; };
    rWidth.onClick = function () { rAsIs.value = false; eWidth.enabled = true; };
    eWidth.enabled = rWidth.value;

    var into = app.documents.length > 0 ? "the open document, " + app.activeDocument.name : "a new document";
    dlg.add("statictext", undefined, "The swatches go into " + into + ". Pictures whose name is already a swatch are skipped.",
        { multiline: true }).preferredSize.width = 470;

    var gB = dlg.add("group");
    gB.alignment = "right";
    var bOk = gB.add("button", undefined, "Add swatches", { name: "ok" });
    gB.add("button", undefined, "Cancel", { name: "cancel" });

    function refreshCount() {
        var f = new Folder(eFolder.text);
        if (eFolder.text === "" || !f.exists) { tCount.text = "That folder doesn't exist."; return; }
        var n = pictureNames(f).length;
        tCount.text = n === 0 ? "No JPG, PNG or TIF pictures in this folder." : n + (n === 1 ? " picture" : " pictures") + " found.";
    }
    eFolder.onChange = refreshCount;
    bBrowse.onClick = function () {
        var start = new Folder(eFolder.text);
        var f = (start.exists ? start : Folder.myDocuments).selectDlg("Choose the folder with your fabric pictures");
        if (f) { eFolder.text = f.fsName; refreshCount(); }
    };
    refreshCount();

    var folder, width = null;
    bOk.onClick = function () {
        folder = new Folder(eFolder.text);
        if (eFolder.text === "" || !folder.exists) { alert("Choose the folder with your fabric pictures."); return; }
        if (pictureNames(folder).length === 0) { alert("There are no JPG, PNG or TIF pictures in\n" + folder.fsName); return; }
        if (rWidth.value) {
            width = parseInches(eWidth.text);
            if (width === null) { alert("Type the tile width in inches, for example 2 or 2.5."); return; }
        }
        dlg.close(1);
    };
    if (dlg.show() !== 1) return;

    saveSettings({ folder: folder.fsName, sizeMode: width === null ? "asis" : "width", width: eWidth.text });

    // ---------- make the swatches ----------
    var doc = app.documents.length > 0 ? app.activeDocument : app.documents.add(DocumentColorSpace.RGB);
    var existing = [], i;
    for (i = 0; i < doc.swatches.length; i++) existing.push(doc.swatches[i].name);
    var plan = planSwatches(pictureNames(folder), existing);

    var made = [], failed = [];
    var progress = new Window("palette", "Adding fabric swatches");
    progress.alignChildren = "fill";
    var pText = progress.add("statictext", undefined, "");
    pText.characters = 50;
    var pBar = progress.add("progressbar", undefined, 0, Math.max(plan.make.length, 1));
    pBar.preferredSize.width = 400;
    if (plan.make.length > 0) { progress.show(); }

    // A layer of our own, so a locked or hidden layer in her document doesn't get in the way.
    var tempLayer = doc.layers.add();
    tempLayer.name = "Adding fabric swatches";
    var oldLevel = app.userInteractionLevel;
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
    try {
        for (i = 0; i < plan.make.length; i++) {
            var item = plan.make[i], raster = null;
            pText.text = (i + 1) + " of " + plan.make.length + ": " + item.name;
            pBar.value = i;
            progress.update();
            try {
                var before = {}, k, pat = null;
                for (k = 0; k < doc.patterns.length; k++) before[doc.patterns[k].name] = true;

                var placed = tempLayer.placedItems.add();
                placed.file = new File(folder.fsName + "/" + item.file);
                placed.embed();                       // the placed item becomes a raster item
                raster = tempLayer.rasterItems[0];
                if (width !== null && raster.width > 0) {
                    var pct = width * 72 / raster.width * 100;
                    raster.resize(pct, pct);
                }
                doc.selection = null;
                raster.selected = true;
                app.executeMenuCommand("Adobe Make Pattern");
                app.executeMenuCommand("exitFocus");  // leave pattern editing mode

                for (k = 0; k < doc.patterns.length; k++) if (!before[doc.patterns[k].name]) pat = doc.patterns[k];
                if (pat === null) throw new Error("no pattern was made");
                pat.name = item.name;
                made.push(item.name);
            } catch (e) {
                try { app.executeMenuCommand("exitFocus"); } catch (e2) { }
                failed.push(item.name + "  (" + e.message + ")");
            }
            try { if (raster) raster.remove(); } catch (e3) { }
        }
    } finally {
        app.userInteractionLevel = oldLevel;
        try { while (tempLayer.pageItems.length > 0) tempLayer.pageItems[0].remove(); tempLayer.remove(); } catch (e4) { }
        doc.selection = null;
        progress.close();
    }

    // ---------- closing message ----------
    var msg = made.length + (made.length === 1 ? " fabric swatch" : " fabric swatches") + " added to the Swatches panel.";
    if (made.length > 0) msg += "\nFill any shape with one to see the fabric repeat.";
    if (plan.skipped.length > 0) msg += "\n\nSkipped, a swatch with this name already exists:\n" + listNames(plan.skipped, 10);
    if (failed.length > 0) msg += "\n\nCould not be added:\n" + listNames(failed, 10);
    alert(msg);
})();
