const fs = require('fs');
const filePath = process.argv[2] || 'app/super-admin/orgs/[id]/page.tsx';
console.log(`Auditing: ${filePath}`);
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

let stack = [];
let voidTags = ['input', 'br', 'hr', 'img', 'meta', 'link'];

lines.forEach((line, i) => {
    const lineNum = i + 1;
    const tags = line.match(/<\/?(\w+)[^>]*\/?>/g);
    if (tags) {
        tags.forEach(tag => {
            const isClosing = tag.startsWith('</');
            const isSelfClosing = tag.endsWith('/>') || voidTags.some(v => tag.startsWith('<' + v));
            const tagNameMatch = tag.match(/<\/?(\w+)/);
            if (!tagNameMatch) return;
            const tagName = tagNameMatch[1];

            if (isSelfClosing) {
                // Ignore
            } else if (isClosing) {
                if (stack.length > 0 && stack[stack.length - 1].name === tagName) {
                    stack.pop();
                } else {
                    // console.log(`[Error] Unmatched closing tag </${tagName}> at line ${lineNum}. Stack Top: <${stack.length > 0 ? stack[stack.length - 1].name : 'EMPTY'}> from line ${stack.length > 0 ? stack[stack.length - 1].line : 'N/A'}`);
                }
            } else {
                stack.push({ name: tagName, line: lineNum });
            }
        });
    }
});

console.log('\n--- Open Tags Left ---');
stack.forEach(s => console.log(`<${s.name}> opened at line ${s.line}`));
if (stack.length === 0) console.log('PASS: All tags balanced.');
else console.log(`FAIL: ${stack.length} tags left open.`);
