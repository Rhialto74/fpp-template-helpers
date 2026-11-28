// Illustrator runs scripts on ExtendScript (old ES3 JavaScript). Modern syntax and ES3
// "future reserved words" used as names make a script fail inside Illustrator even though
// it runs fine in Node. This bit us once ("Illegal use of reserved word 'short'").
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const files = ['src/illustrator/MakeFPPTemplates.jsx', 'src/illustrator/AddFabricSwatches.jsx',
  'src/illustrator/legacy/SplitSectionForPrinting.jsx',
  'src/illustrator/legacy/TileToArtboards.jsx'].map(f => path.join(__dirname, '..', f));

const reserved = ['abstract', 'boolean', 'byte', 'char', 'class', 'const', 'debugger', 'double', 'enum',
  'export', 'extends', 'final', 'float', 'goto', 'implements', 'import', 'int', 'interface', 'let',
  'long', 'native', 'package', 'private', 'protected', 'public', 'short', 'static', 'super',
  'synchronized', 'throws', 'transient', 'volatile', 'yield'];

function codeLines(src) {
  // strip comments and string contents so words inside them don't count
  return src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .split('\n').map(l => l.replace(/\/\/.*$/, '')
      .replace(/"(?:\\.|[^"\\])*"/g, '""').replace(/'(?:\\.|[^'\\])*'/g, "''")
      .replace(/\/(?:\\.|[^\/\\\n])+\/[gimy]*/g, '//'));
}

for (const f of files) {
  test(path.basename(f) + ' is ExtendScript-safe', () => {
    const lines = codeLines(fs.readFileSync(f, 'utf8'));
    const problems = [];
    lines.forEach((l, i) => {
      for (const w of reserved) if (new RegExp('\\b' + w + '\\b').test(l)) problems.push(`line ${i + 1}: reserved word "${w}"`);
      if (/=>/.test(l)) problems.push(`line ${i + 1}: arrow function`);
      if (/`/.test(l)) problems.push(`line ${i + 1}: template string`);
      if (/\.(forEach|map|filter|reduce|trim|includes|find)\s*\(/.test(l) && !/\.replace/.test(l))
        problems.push(`line ${i + 1}: method missing in ES3 (${l.trim().slice(0, 60)})`);
    });
    assert.deepStrictEqual(problems, []);
  });
}
