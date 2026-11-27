# FPP Template Helpers

Two small add-ons that turn a foundation paper piecing (FPP) section drawn in Adobe Illustrator
into printable, true-scale template pages inside a Word pattern document.

1. **`src/illustrator/MakeFPPTemplates.jsx`** (Illustrator script)
   Splits one selected section across letter-size sheets, makes **Left** and **Right** versions
   (one of them mirrored, with text flipped back so it reads normally), adds glue strips,
   matching circles, trim lines, "Sheet X of N" labels, a 1-inch scale graphic and an assembly
   map, then exports 300 ppi PNGs plus a `sheets.txt` list into one folder per side.
2. **`src/word/AddTemplateSheets.bas`** (Word VBA macro)
   Appends those sheets to the open pattern document, one per page: a title in the pattern's
   heading style, a print note, and the picture placed on the page at its exact size.

End-user instructions (for someone who has never used a script) are in
[`docs/FPP-Template-Helpers-Guide.html`](docs/FPP-Template-Helpers-Guide.html).

## Layout

```
src/illustrator/MakeFPPTemplates.jsx      current Illustrator helper
src/illustrator/legacy/                   earlier versions (plain grid tiling; single side)
src/word/AddTemplateSheets.bas            current Word helper
src/word/legacy/BuildTileDocument.bas     earlier version (plain Letter document)
docs/FPP-Template-Helpers-Guide.html      end-user guide (ships in the zip as "Start here - ...")
assets/1 Inch.ai                          the designer's 1-inch scale graphic
tests/                                    Node tests for the geometry + ExtendScript compatibility
scripts/build-release.ps1                 builds dist/FPP-Template-Helpers.zip
```

## Develop

- `npm test` runs the tests (Node 20+, no dependencies). They cover the tiling geometry against a
  real section and check the Illustrator script for syntax that ExtendScript (ES3) can't run.
- Illustrator and Word behaviour can only be checked by running the helpers in those apps.

## Release

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-release.ps1
```

Produces `dist\FPP-Template-Helpers.zip` containing the guide, both helpers and `1 Inch.ai`, flat,
so "Extract All" into `Documents\FPP-Template-Helpers` matches the guide.
