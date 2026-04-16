const fs = require('fs');
const path = 'app/super-admin/orgs/[id]/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// Section 1 opens at line 172: <div className="space-y-6">
// It should close before Section 2 starts at line 284: {/* Primary HR Controller */}

const searchStr = '{/* Primary HR Controller */}';
if (content.includes(searchStr)) {
    // Add a closing div before Section 2
    content = content.replace(searchStr, '</div>\n\n                ' + searchStr);
    console.log('Added closing div before Section 2');
}

// Final check: Let's count divs again
const openDivs = (content.match(/<div(?!\w)/g) || []).length;
const closeDivs = (content.match(/<\/div>/g) || []).length;

console.log(`Final Audit -> Open Divs: ${openDivs}, Close Divs: ${closeDivs}`);

if (openDivs === closeDivs) {
    fs.writeFileSync(path, content);
    console.log('File balanced and saved successfully');
} else {
    console.log('File STILL unbalanced. Not saving.');
}
