const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const script = fs.readFileSync('js/main.js', 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const duplicateIDs = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
const knownIDs = new Set(ids);
const referencedIDs = [...script.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map((match) => match[1]);
const missingIDs = [...new Set(referencedIDs.filter((id) => !knownIDs.has(id)))];

if (duplicateIDs.length || missingIDs.length) {
  if (duplicateIDs.length) console.error(`Duplicate HTML ids: ${duplicateIDs.join(', ')}`);
  if (missingIDs.length) console.error(`Missing HTML ids: ${missingIDs.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log(`Project structure OK: ${ids.length} unique DOM ids checked.`);
}
