# CLAUDE.md

Context for working on this repo. Read before changing anything.

## What this is

Tools for a quilt pattern designer (not a programmer) who draws foundation paper piecing (FPP)
templates in Adobe Illustrator and publishes patterns as Word documents built from her company
template. Sections are often larger than a printable page, so they must be split onto letter-size
sheets that the quilter prints at true size, trims, tapes together and then cuts out.

- `src/illustrator/MakeFPPTemplates.jsx` – the Illustrator helper (ExtendScript).
- `src/word/AddTemplateSheets.bas` – the Word helper (VBA module named `FPPSheets`).
- `docs/FPP-Template-Helpers-Guide.html` – the end-user guide. Keep it in plain language: no
  "script", "macro", "JavaScript" or "VBA" jargon beyond file names. It covers the software only;
  the designer is the expert on sewing/assembly, so don't add quilting instructions.
- Legacy versions in `legacy/` folders are kept for reference only.

## Domain rules (get these right)

- FPP is sewn from the printed side, so the printed template is the MIRROR of the finished front.
- The block is symmetrical: the right half is the left half flipped. The designer's section files
  (e.g. `Group A-Right Image-LABELED.ai`) show the **RIGHT half as seen on the quilt front**.
  Therefore: **Right templates = mirrored artwork; Left templates = artwork as drawn.**
  The dialog asks which half the artwork shows (default RIGHT) and the code derives the rest.
- When mirroring, every TextFrame is flipped back in place so labels read normally.
- Patch labels look like `A-1 (Color 2)`. Optional "add R" turns `A-1` into `A-1R` on Right sheets.
- Sheet labels say "Sheet 3 of 7" – deliberately NOT "A1/B2" style, which would clash with patch labels.
- Working area defaults to 7 x 8.5 in (fits her Word template between header and footer); glue
  strip 0.5 in. The sheet carrying the glue strip gets a dashed line + circles + "Sheet N goes
  here"; the neighbour gets a solid trim line + the same circles + "Trim on this line, lay over Sheet M".
- The 1-inch graphic (`1 Inch.ai`) goes on every sheet in an empty spot, never on the assembly map
  (the map is not to scale). A sheet completely covered by the template gets none; the closing
  message lists those.
- Page titles: `<Section> - <Left|Right> Template (Sheet n of N)`; map: `... Template - Assembly Map`.
  Heading style in Word: Gadugi 16pt bold, underlined, colour RGB(37,99,88); note line Gadugi 10pt italic.

## How the Illustrator helper works

1. Works on the current selection (one section). Copies it (`app.copy()`), creates a NEW document
   and pastes in place (`executeMenuCommand("pasteFront")`). The original file is never changed.
2. Outline used for tiling = convex hull of all path anchors and direction handles.
   **Ignored for the outline:** text frames (labels can poke past the edge), stray single points,
   unpainted paths, hidden items and guides. Concave sections may cost an extra sheet; nothing is cut off.
3. Tiling (`planTiles`): rows across the hull, each row fitted to the shape's extent in that band,
   columns spread evenly; three row layouts are tried and the fewest sheets wins. `bestRotation`
   tries 0–179° and the user is asked before turning. Mirrored side uses the opposite angle.
4. Each sheet = the artwork clipped to the sheet (+ glue strips) on its own artboard, centred.
5. Export: one PNG per artboard (300 ppi, white), into `<chosen folder>/<Section> - Left|Right/`
   as `00-Map.png`, `Sheet-01.png`…, plus `sheets.txt` (UTF-8, tab-separated:
   first line `SIZE<TAB>w<TAB>h`, then `file<TAB>title<TAB>note`). The Word helper depends on this format.
6. Section-name default comes from the document name with `.ai/.aic`, `-LABELED`, `-Gray Filled`,
   `-Left/Right Image` stripped. 1-inch path: remembered in `Folder.userData/MakeFPPTemplates-settings.txt`,
   else looked for next to the open file, else next to the helper itself (cloud documents have no folder).

Everything between `GEO-START` and `GEO-END` is pure geometry with no Illustrator calls. Outside
Illustrator (`typeof app === "undefined"`) the script exposes it as `$GEO` and returns, which is
how `tests/geometry.test.js` runs it in Node. Keep it that way.

## ExtendScript pitfalls we actually hit (do not regress)

- ExtendScript is ES3. No `let/const`, arrow functions, template strings, `Array.prototype.forEach/map/
  filter/indexOf`, `String.prototype.trim`. ES3 *future reserved words* (`short`, `int`, `char`,
  `class`, `final`, `native`, `export`…) cannot be used as names – `function f(short)` crashed it.
  `tests/extendscript-compat.test.js` checks for these; run `npm test` before every change.
- `item.duplicate(groupInOtherDocument)` fails with Error 1200 'PARM'. Cross-document copies must go
  through the clipboard (copy, then `pasteFront` in the target doc). Within one document,
  duplicate/move into groups is fine.
- Nothing can be changed on a hidden layer ("Error 8705: Target layer cannot be modified").
  Hide layers only after all edits.
- Exporting PNGs with `saveMultipleArtboards = true` in one `exportFile` call overwrote a single file.
  Export each artboard separately: `setActiveArtboardIndex(i)` then `exportFile`.
- Illustrator turns spaces in export file names into hyphens – keep exported names space-free.
- Script errors show "Line N" – the line in the .jsx file; ask for a screenshot of the dialog.

## Word helper notes

- Shipped as a Word add-in, `FPP Template Helpers.dotm`, built from the `.bas` by
  `scripts/build-word-addin.ps1` (Word COM; needs AccessVBOM, which `-TemporarilyTrustVba` flips
  on and restores). The updater copies it into Word's Startup folder, so Word loads it on start and
  updates need no re-import. Run from View › Macros. Appends pages to the END of the active
  document; reads only `sheets.txt` + PNGs.
- Pictures are floating shapes positioned relative to the PAGE (centred, bottom 0.95 in above the
  page edge, wrap behind text) so the template's header/footer and margins don't matter.
- Don't call `Dir()` inside a `Dir()` loop – it restarts the listing. Collect names first.
- Proportion check warns if a picture's aspect ratio doesn't match the size in `sheets.txt`.
- `.bas` must keep CRLF line endings (see `.gitattributes`).

## Testing changes

1. `npm test`.
2. Real check: run the Illustrator helper on a section file (Ctrl+A first), inspect the PNGs and maps
   (Left = as drawn, Right = mirrored, labels readable, straight map outline, 1-inch box present).
3. Run the Word helper on a COPY of the pattern document; check pictures sit between header and footer.
4. Ship with `scripts/release.ps1 -Version x.y.z -TemporarilyTrustVba` (needs Word). It publishes a GitHub
   release; the designer's **Update FPP Helpers** desktop icon (`src/updater/Update-FPPHelpers.ps1`,
   Windows PowerShell 5.1, ASCII only) installs the latest release. Keep the zip's file names stable:
   the updater looks for `FPP-Template-Helpers.zip` and `FPP Template Helpers.dotm`.

## Not in this repo

The designer's section artwork, pattern documents and Word template are her work product and stay
out of version control. `tests/fixtures/dark-blue-section.json` is only extracted outline geometry.
