// App-owned CSS/React audit; third-party KaTeX and structural media queries are excluded.
const fs = require('node:fs');
const path = require('node:path');
const postcss = require('../frontend/node_modules/postcss');
const source = path.join(__dirname, '../frontend/src');
const errors = [];
const names = new Set();
const references = [];
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
for (const file of walk(source)) {
  if (file.endsWith('.css')) {
    postcss.parse(fs.readFileSync(file, 'utf8'), { from: file }).walkDecls(declaration => {
      if (declaration.prop.startsWith('--')) {
        if (path.basename(file) !== 'tokens.css') errors.push(`${file}: token defined outside tokens.css`);
        names.add(declaration.prop);
      } else if (/(#[\da-f]{3,8}\b|\b(?:rgba?|hsla?)\(|-?\d*\.?\d+(?:px|rem)\b)/i.test(declaration.value)) {
        errors.push(`${file}:${declaration.source.start.line}: literal ${declaration.prop}: ${declaration.value}`);
      }
      for (const match of declaration.value.matchAll(/var\((--[\w-]+)/g)) references.push([match[1], file]);
    });
  } else if (/\.[jt]sx?$/.test(file) && !/\.test\./.test(file)) {
    const text = fs.readFileSync(file, 'utf8');
    if (/(?:#[\da-f]{3,8}\b|\b(?:rgba?|hsla?)\()/i.test(text)) errors.push(`${file}: literal color`);
    if (/\b(?:fontSize|padding|margin|gap|borderRadius)\s*:\s*['"\d]/.test(text)) errors.push(`${file}: literal inline styling`);
  }
}
for (const [name, file] of references) if (!names.has(name)) errors.push(`${file}: undefined ${name}`);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Visual token audit passed: ${names.size} tokens; no app-owned literal colors or lengths outside definitions.`);
