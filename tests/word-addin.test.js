// The Word add-in (FPP Template Helpers.dotm) is built by Word itself, which can't run in a test.
// Twice (v1.1.0, v1.4.1) Word saved it without the parts that connect the macros, so Word ignored
// them and AddTemplateSheets vanished from View > Macros. These tests make sure the checks that
// now guard against that keep telling a good add-in from a broken one:
//   - scripts/check-word-addin.ps1 (run by the build and by release.cmd before publishing)
//   - Test-AddinHasMacros in the updater (stops it removing the old Normal copy while the add-in is broken)
// Fixtures are real add-ins from those releases. Windows only (needs Windows PowerShell).
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const good = path.join(__dirname, 'fixtures', 'word-addin-good-v1.4.0.dotm');
const broken = path.join(__dirname, 'fixtures', 'word-addin-broken-v1.4.1.dotm');
const skip = process.platform !== 'win32' && 'needs Windows PowerShell';

function ps(args) {
  return spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', ...args], { encoding: 'utf8' });
}

function checker(file) {
  return ps(['-File', path.join(root, 'scripts', 'check-word-addin.ps1'), '-Path', file]);
}

test('the build unloads installed add-ins before saving (the cause of the broken builds)', () => {
  const src = fs.readFileSync(path.join(root, 'scripts', 'build-word-addin.ps1'), 'utf8');
  const unload = src.search(/\.Installed\s*=\s*\$false/);
  assert.ok(unload > 0, 'build-word-addin.ps1 no longer unloads add-ins in its hidden Word');
  assert.ok(unload < src.indexOf('SaveAs2'), 'add-ins must be unloaded before the add-in is saved');
});

test('the build and the release both run check-word-addin', () => {
  for (const f of ['build-word-addin.ps1', 'release.ps1']) {
    const src = fs.readFileSync(path.join(root, 'scripts', f), 'utf8');
    assert.match(src, /check-word-addin\.ps1/, `${f} no longer checks the add-in`);
  }
  const rel = fs.readFileSync(path.join(root, 'scripts', 'release.ps1'), 'utf8');
  assert.ok(rel.indexOf('check-word-addin.ps1') < rel.indexOf("'release', 'create'"),
    'release.ps1 must check the add-in before publishing');
});

test('check-word-addin accepts a good add-in', { skip }, () => {
  const r = checker(good);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
});

test('check-word-addin rejects an add-in saved without its macro parts', { skip }, () => {
  const r = checker(broken);
  assert.strictEqual(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /vbaProject\.bin\.rels/);
});

test('check-word-addin checks the add-in inside a release zip', { skip }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fpp-addin-'));
  try {
    for (const [name, src] of [['good', good], ['broken', broken]]) {
      const zip = path.join(dir, `${name}.zip`);
      const stage = path.join(dir, name);
      fs.mkdirSync(stage);
      fs.copyFileSync(src, path.join(stage, 'FPP Template Helpers.dotm'));
      const z = ps(['-Command', `Compress-Archive -Path '${stage}\\*' -DestinationPath '${zip}'`]);
      assert.strictEqual(z.status, 0, z.stderr);
      assert.strictEqual(checker(zip).status, name === 'good' ? 0 : 1, `${name} zip`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("updater's Test-AddinHasMacros tells good from broken", { skip }, () => {
  // Load the updater's functions (everything before its main try block) and point them at the fixtures.
  const src = fs.readFileSync(path.join(root, 'src', 'updater', 'Update-FPPHelpers.ps1'), 'utf8');
  const start = src.indexOf('function Show-Msg');
  const end = src.indexOf('# This file\'s text as it was when it started');
  assert.ok(start > 0 && end > start, 'could not find the updater functions');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fpp-updater-'));
  try {
    const script = path.join(dir, 'probe.ps1');
    fs.writeFileSync(script, [
      'Add-Type -AssemblyName System.IO.Compression',
      'Add-Type -AssemblyName System.IO.Compression.FileSystem',
      src.slice(start, end),
      `function Get-WordStartupFolder { '${path.dirname(good)}' }`,
      `$AddinName = '${path.basename(good)}'; 'good=' + (Test-AddinHasMacros)`,
      `$AddinName = '${path.basename(broken)}'; 'broken=' + (Test-AddinHasMacros)`,
      `$AddinName = 'no-such-file.dotm'; 'missing=' + (Test-AddinHasMacros)`,
    ].join('\r\n'));
    const r = ps(['-File', script]);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /good=True/);
    assert.match(r.stdout, /broken=False/);
    assert.match(r.stdout, /missing=False/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
