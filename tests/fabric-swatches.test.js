// Tests for Add Fabric Swatches (src/illustrator/AddFabricSwatches.jsx).
// Outside Illustrator the helper only defines its pure functions (PURE-START..PURE-END) and exposes them
// as $FABRIC. The Illustrator part (placing, Make Pattern, exitFocus) can only run inside Illustrator;
// these tests also make sure it keeps the steps that made it work there.
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src', 'illustrator', 'AddFabricSwatches.jsx'), 'utf8');
// eslint-disable-next-line no-eval
(0, eval)(src.replace(/^#target.*\n/, ''));
const F = globalThis.$FABRIC;

test('only JPG, PNG and TIF pictures count', () => {
  for (const n of ['a.jpg', 'b.JPEG', 'c.png', 'd.tif', 'e.TIFF']) assert.ok(F.isPicture(n), n);
  for (const n of ['a.ai', 'b.pdf', 'jpg', 'c.jpg.txt', 'Thumbs.db']) assert.ok(!F.isPicture(n), n);
});

test('swatch names come from the file name', () => {
  assert.strictEqual(F.swatchName('Kona Red 1308.jpg'), 'Kona Red 1308');
  assert.strictEqual(F.swatchName('Kona%20Red%201308.jpg'), 'Kona Red 1308');
  assert.strictEqual(F.swatchName('Moda.Blue.Dots.png'), 'Moda.Blue.Dots');
  assert.strictEqual(F.swatchName('  spaced .jpg'), 'spaced');
  assert.strictEqual(F.swatchName('100%.jpg'), '100%');   // not valid URI encoding: kept as is
});

test('tile width accepts the ways she might type it', () => {
  assert.strictEqual(F.parseInches('2'), 2);
  assert.strictEqual(F.parseInches(' 2.5 '), 2.5);
  assert.strictEqual(F.parseInches('2,5'), 2.5);
  assert.strictEqual(F.parseInches('.75'), 0.75);
  assert.strictEqual(F.parseInches('3 in'), 3);
  assert.strictEqual(F.parseInches('3 inches'), 3);
  assert.strictEqual(F.parseInches('3"'), 3);
  for (const bad of ['', 'abc', '0', '-2', '2x', '101', '1.2.3']) assert.strictEqual(F.parseInches(bad), null, bad);
});

test('settings round-trip and tolerate junk lines', () => {
  const s = { folder: 'C:\\Fabric=Pics', sizeMode: 'width', width: '2' };
  assert.deepStrictEqual(F.parseSettings(F.formatSettings(s)), s);
  assert.deepStrictEqual(F.parseSettings('no equals\r\n=nokey\r\nwidth=3\r\n'), { width: '3' });
  assert.deepStrictEqual(F.parseSettings(''), {});
  const inherited = Object.create({ hidden: 'x' });
  inherited.shown = 'y';
  assert.strictEqual(F.formatSettings(inherited), 'shown=y\n');
});

test('planSwatches skips non-pictures, existing names and duplicates', () => {
  const plan = F.planSwatches(
    ['Red.jpg', 'notes.txt', 'Blue.png', 'red.png', 'Green.tif', '.jpg', 'Foliage.jpg'],
    ['[None]', 'foliage']);
  assert.deepStrictEqual(plan.make, [
    { file: 'Red.jpg', name: 'Red' },
    { file: 'Blue.png', name: 'Blue' },
    { file: 'Green.tif', name: 'Green' },
  ]);
  assert.deepStrictEqual(plan.skipped, ['red', 'Foliage']);
});

test('listNames shortens long lists', () => {
  assert.strictEqual(F.listNames(['a', 'b'], 3), 'a\nb');
  assert.strictEqual(F.listNames(['a', 'b', 'c', 'd', 'e'], 3), 'a\nb\nc\n... and 2 more');
});

test('the Illustrator part keeps the steps that work in Illustrator', () => {
  // Error 1266: art can't be duplicated into doc.patterns.add(); Make Pattern is the way that works.
  const code = src.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  assert.doesNotMatch(code, /patterns\.add\(/);
  const make = src.indexOf('app.executeMenuCommand("Adobe Make Pattern")');
  const exit = src.indexOf('app.executeMenuCommand("exitFocus")');
  assert.ok(make > 0 && exit > make, 'Make Pattern, then leave pattern editing mode');
  // Without this, Illustrator stops on its "new pattern has been added" notice for every picture.
  const quiet = src.indexOf('UserInteractionLevel.DONTDISPLAYALERTS');
  assert.ok(quiet > 0 && quiet < make);
  assert.match(src.slice(src.indexOf('finally', make)), /app\.userInteractionLevel = oldLevel/);
  // Pictures are embedded so the swatches don't depend on the picture files.
  assert.ok(src.indexOf('.embed()') < make);
});

test('the release and the updater include Add Fabric Swatches', () => {
  const build = fs.readFileSync(path.join(root, 'scripts', 'build-release.ps1'), 'utf8');
  assert.match(build, /src\\illustrator\\AddFabricSwatches\.jsx/);
  const upd = fs.readFileSync(path.join(root, 'src', 'updater', 'Update-FPPHelpers.ps1'), 'utf8');
  assert.match(upd, /Helper = 'AddFabricSwatches\.jsx';\s*Menu = 'Add Fabric Swatches'/);
  assert.match(upd, /Helper = 'MakeFPPTemplates\.jsx';\s*Menu = 'Make FPP Templates'/);
});

test("updater's Get-MissingLaunchers finds missing and outdated menu entries",
  { skip: process.platform !== 'win32' && 'needs Windows PowerShell' }, () => {
    const upd = fs.readFileSync(path.join(root, 'src', 'updater', 'Update-FPPHelpers.ps1'), 'utf8');
    const head = upd.slice(upd.indexOf('$MenuEntries = @('), upd.indexOf('# Settings shared'));
    const fns = upd.slice(upd.indexOf('function Get-MenuLauncherText'), upd.indexOf('# Returns a sentence for the closing message'));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fpp-menu-'));
    try {
      const scripts = path.join(dir, 'Scripts');
      fs.mkdirSync(scripts);
      const probe = path.join(dir, 'probe.ps1');
      fs.writeFileSync(probe, [
        head, fns,
        `$h = '${dir}\\Helpers'; $s = '${scripts}'`,
        "'start=' + (((Get-MissingLaunchers $h @($s)) | ForEach-Object { Split-Path -Leaf $_.File }) -join ',')",
        "foreach ($n in (Get-MissingLaunchers $h @($s))) { [IO.File]::WriteAllText($n.File, $n.Text) }",
        "'done=' + (Get-MissingLaunchers $h @($s)).Count",
        "[IO.File]::WriteAllText((Join-Path $s 'Add Fabric Swatches.jsx'), 'old')",
        "'stale=' + (((Get-MissingLaunchers $h @($s)) | ForEach-Object { Split-Path -Leaf $_.File }) -join ',')",
        "'text=' + (Get-MenuLauncherText 'C:\\X\\AddFabricSwatches.jsx').Contains('new File(\"C:/X/AddFabricSwatches.jsx\")')",
      ].join('\r\n'));
      const r = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', probe], { encoding: 'utf8' });
      assert.strictEqual(r.status, 0, r.stderr);
      assert.match(r.stdout, /start=Make FPP Templates\.jsx,Add Fabric Swatches\.jsx/);
      assert.match(r.stdout, /done=0/);
      assert.match(r.stdout, /stale=Add Fabric Swatches\.jsx\r?\n/);
      assert.match(r.stdout, /text=True/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
