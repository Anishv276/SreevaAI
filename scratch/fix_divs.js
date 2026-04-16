const fs = require('fs');
const path = 'app/super-admin/orgs/[id]/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// Fix Section 1
const section1End = '{/* Primary HR Controller */}';
if (content.includes(section1End)) {
    const parts = content.split(section1End);
    // Add </div> to the end of the first part (before the comment)
    parts[0] = parts[0].trimEnd() + '\n            </div>\n\n                ';
    content = parts.join(section1End);
}

// Fix Section 5
const section5End = '{error && (';
if (content.includes(section5End)) {
    const parts = content.split(section5End);
    // Add </div> to the end of the first part
    parts[0] = parts[0].trimEnd() + '\n            </div>\n\n                ';
    content = parts.join(section5End);
}

fs.writeFileSync(path, content);
console.log('Balanced Section 1 and Section 5 wrappers.');
