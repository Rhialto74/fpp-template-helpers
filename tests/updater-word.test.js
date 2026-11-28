// The updater and Word running in the background.
// v1.5.0's updater started a hidden Word to remove the old macro copy from Normal.dotm; when that Word
// didn't quit, it stayed running for hours, and the next update kept asking her to "close Word" with no
// Word window to close. These tests keep the two fixes in place:
//   - Remove-OldWordMacros ends the Word it started if that Word won't quit (and only that one).
//   - Before installing, a Word with no window is offered to be closed instead of asking her to close it.
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const upd = fs.readFileSync(path.join(__dirname, '..', 'src', 'updater', 'Update-FPPHelpers.ps1'), 'utf8');
const skip = process.platform !== 'win32' && 'needs Windows PowerShell';

function fn(name) {
  const start = upd.indexOf('function ' + name);
  assert.ok(start > 0, name + ' not found');
  const next = upd.indexOf('\nfunction ', start + 1);
  return upd.slice(start, next).replace(/\r?\n# [^\n]*(\r?\n# [^\n]*)*\r?\n?$/, '\r\n');
}

function body(name) {
  const start = upd.indexOf('function ' + name);
  return upd.slice(start, upd.indexOf('\nfunction ', start + 1));
}

test('Remove-OldWordMacros ends only the Word it started, after asking it to quit', () => {
  const b = body('Remove-OldWordMacros');
  const before = b.indexOf('$before = @(Get-Process -Name WINWORD');
  const start = b.indexOf('New-Object -ComObject Word.Application');
  const ours = b.indexOf('$ours = @(Get-Process -Name WINWORD');
  assert.ok(before > 0 && before < start && start < ours, 'notes the Word processes before and after starting Word');
  assert.match(b, /\$before -notcontains \$_\.Id/);
  const saved = b.indexOf('NormalTemplate.Saved = $true');
  const quit = b.indexOf('$word.Quit()');
  const stop = b.indexOf('Stop-Process');
  assert.ok(saved > 0 && saved < quit && quit < stop, 'marks Normal saved, quits, and only then ends it');
  assert.match(b.slice(stop - 80, stop + 60), /Get-OurWord \$ours[\s\S]*Stop-Process -Id \$p\.Id/);
  assert.doesNotMatch(b, /Stop-Process -Name/, 'must never end every Word');
});

test('the install waits for Word, but closes a Word that has no window after asking', () => {
  const from = upd.indexOf('# Word keeps the add-in file locked');
  assert.ok(from > 0);
  const loop = upd.slice(from, upd.indexOf('$tmp = Join-Path $env:TEMP', from));
  const hidden = loop.indexOf('Test-OnlyHiddenWord $procs');
  const ask = loop.indexOf("'OKCancel'", hidden);
  const stop = loop.indexOf('Stop-Process', hidden);
  assert.ok(hidden > 0 && ask > hidden && stop > ask, 'asks before closing the hidden Word');
  assert.match(loop, /Please save your work and close Word/, 'a Word with a window still has to be closed by her');
});

test('Test-OnlyHiddenWord and Get-OurWord', { skip }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fpp-word-'));
  try {
    const probe = path.join(dir, 'probe.ps1');
    fs.writeFileSync(probe, [
      fn('Get-OurWord'), fn('Test-OnlyHiddenWord'),
      "function W($h) { [pscustomobject]@{ MainWindowHandle = [IntPtr]$h } }",
      "'none=' + (Test-OnlyHiddenWord @())",
      "'null=' + (Test-OnlyHiddenWord $null)",
      "'hidden=' + (Test-OnlyHiddenWord @((W 0)))",
      "'twohidden=' + (Test-OnlyHiddenWord @((W 0), (W 0)))",
      "'visible=' + (Test-OnlyHiddenWord @((W 1234)))",
      "'mixed=' + (Test-OnlyHiddenWord @((W 0), (W 1234)))",
      "'ourEmpty=' + (Get-OurWord @()).Count",
      "'ourGone=' + (Get-OurWord @(999999999)).Count",
    ].join('\r\n'));
    const r = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', probe], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stderr);
    for (const want of ['none=False', 'null=False', 'hidden=True', 'twohidden=True', 'visible=False',
      'mixed=False', 'ourEmpty=0', 'ourGone=0']) {
      assert.match(r.stdout, new RegExp('^' + want + '\\r?$', 'm'), want + '\n' + r.stdout);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
