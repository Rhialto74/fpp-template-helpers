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

End-user instructions (for someone who has never used a script):
**[read the guide](https://rhialto74.github.io/fpp-template-helpers/FPP-Template-Helpers-Guide.html)**
(published by GitHub Pages from [`docs/`](docs/FPP-Template-Helpers-Guide.html) on `main`).

## Layout

```
src/illustrator/MakeFPPTemplates.jsx      current Illustrator helper
src/illustrator/legacy/                   earlier versions (plain grid tiling; single side)
src/word/AddTemplateSheets.bas            current Word helper
src/word/legacy/BuildTileDocument.bas     earlier version (plain Letter document)
docs/FPP-Template-Helpers-Guide.html      end-user guide (ships in the zip as "Start here - ...")
assets/1 Inch.ai                          the designer's 1-inch scale graphic
tests/                                    Node tests for the geometry + ExtendScript compatibility
src/updater/                              "Update FPP Helpers" updater + one-time setup .cmd
scripts/build-word-addin.ps1              builds the Word add-in (.dotm) from the .bas (needs Word)
scripts/build-release.ps1                 builds dist/FPP-Template-Helpers.zip
scripts/release.ps1                       tests, builds, tags and publishes a GitHub release
```

## Develop

- `npm test` runs the tests (Node 20+, no dependencies). They cover the tiling geometry against a
  real section and check the Illustrator script for syntax that ExtendScript (ES3) can't run.
- Illustrator and Word behaviour can only be checked by running the helpers in those apps.

## Release

Close Word, then double-click `release.cmd` (or run `.\release` in a terminal in the repo folder).

It needs a Windows PC with Word, a clean `main`, and the GitHub account that can push to this repo
(`git` and `gh auth login`). It shows the next version (last release + 0.1.0) and notes made from the
commit subjects since the last release, and waits: Enter releases, typing a version (e.g. `1.3.1`)
changes it, `N` stops. Then it pushes `main` if needed, runs the tests, builds
`dist\FPP-Template-Helpers.zip` (guide, Illustrator helper, Word add-in `FPP Template Helpers.dotm`,
`1 Inch.ai`, updater, `version.txt`), tags the version and creates a GitHub release with the zip and
`Install-FPP-Helpers.cmd`. Word's "Trust access to the VBA project object model" is switched on only
while the add-in is built, then restored.

Options (also through `release.cmd`): `-Version 1.3.1`, `-Notes "..."`, `-Yes` (no question),
`-DryRun` (checks, tests and preview only; nothing pushed or published).

The release also carries `Install-FPP-Helpers.cmd` (from `src/updater/`) on its own. On the designer's
computer, setup is once: download it (the guide links to `releases/latest/download/Install-FPP-Helpers.cmd`)
and double-click it. It downloads the latest zip to a temp folder and runs the setup inside it
(`Update FPP Helpers.ps1 -Install`; the zip's `Set up updates (run once).cmd` does the same). That installs into `Documents\FPP-Template-Helpers`,
copies the add-in into Word's Startup folder (Word loads it on start) and creates an
**Update FPP Helpers** desktop icon, which fetches the latest release whenever she clicks it.
