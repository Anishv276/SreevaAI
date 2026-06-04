/**
 * Fix UTF-8 mojibake across public HTML/CSS/JS files.
 * Only replaces known bad sequences — never touches attribute quotes.
 * Run: node scripts/fix-encoding.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

// Map of garbled bytes (as they appear in the file) → correct UTF-8 character
const REPLACEMENTS = [
  // Order matters: longest match first
  ['â€"â€"', '— '],   // double em-dash (chapter eyebrows)
  ['â€"',    '—'],    // em dash
  ['â€™',    '’'], // right single quote / apostrophe
  ['â€œ',    '“'], // left double quote
  ['â€\x9d', '”'], // right double quote
  ['Â·',     '·'], // middle dot ·
  ['Ã—',     '×'], // multiplication sign ×
  ['â„',     '⁄'], // fraction slash ⁄
  ['Â',      ''],       // stray non-breaking space prefix byte
];

const TARGET_EXTS = new Set(['.html', '.css', '.js']);
const TARGET_DIRS = ['public'];

function fixFile(filePath) {
  let content = readFileSync(filePath, 'utf8');
  const original = content;

  for (const [bad, good] of REPLACEMENTS) {
    content = content.split(bad).join(good);
  }

  if (content !== original) {
    writeFileSync(filePath, content, 'utf8');
    console.log('  fixed:', filePath);
    return true;
  }
  return false;
}

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full);
    } else if (TARGET_EXTS.has(extname(entry))) {
      fixFile(full);
    }
  }
}

console.log('Fixing encoding in:', TARGET_DIRS);
for (const dir of TARGET_DIRS) {
  walk(dir);
}
console.log('Done.');
