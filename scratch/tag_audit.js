const fs = require('fs');
const content = fs.readFileSync('app/super-admin/orgs/[id]/page.tsx', 'utf8');
const lines = content.split('\n');

let stack = [];
let output = [];

lines.forEach((line, index) => {
    const lineNum = index + 1;
    // Simple regex for tags, ignoring props for now
    const tags = line.match(/<(div|form|button|span|section|header|footer|label|select|input|optgroup|option|h1|h2|h3|h4|p|button|Loader2|CheckCircle2|ArrowLeft|Building2|ShieldCheck|Globe|User|Mail|ShieldAlert|RefreshCw|Lock|MapPinIcon)|\/(div|form|button|span|section|header|footer|label|select|input|optgroup|option|h1|h2|h3|h4|p|button|Loader2|CheckCircle2|ArrowLeft|Building2|ShieldCheck|Globe|User|Mail|ShieldAlert|RefreshCw|Lock|MapPinIcon)>/g);

    if (tags) {
        tags.forEach(tag => {
            if (tag.startsWith('</')) {
                const tagName = tag.match(/<\/(\w+)/)[1];
                if (stack.length > 0 && stack[stack.length - 1].name === tagName) {
                    stack.pop();
                } else {
                    output.push(`Unmatched closing tag at line ${lineNum}: ${tag}. Current stack top: ${stack.length > 0 ? stack[stack.length - 1].name : 'empty'}`);
                }
            } else if (tag.includes('/>')) {
                // Self-closing
            } else {
                const tagName = tag.match(/<(\w+)/)[1];
                // Ignore truly self-closing tags like input, Loader2 etc if not marked with />
                if (!['input', 'Loader2', 'CheckCircle2', 'ArrowLeft', 'Building2', 'ShieldCheck', 'Globe', 'User', 'Mail', 'ShieldAlert', 'RefreshCw', 'Lock', 'MapPinIcon'].includes(tagName)) {
                   stack.push({ name: tagName, line: lineNum });
                }
            }
        });
    }
});

console.log('--- Stack Summary ---');
console.log(`Remaining open tags: ${stack.length}`);
stack.forEach(s => console.log(`Open tag <${s.name}> at line ${s.line}`));
console.log('--- Errors ---');
output.forEach(o => console.log(o));
