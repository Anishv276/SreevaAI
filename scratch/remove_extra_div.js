const fs = require('fs');
const path = 'app/super-admin/orgs/[id]/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// The script fix_divs.js added an extra </div> before {error && (
// Let's find that block and remove one </div>.

const target = '</div>\n\n                {error && (';
// Currently it should have two or more </div> because of my previous script
// Let's look for specifically what fix_divs.js did:
// parts[0] = parts[0].trimEnd() + '\n            </div>\n\n                ';

// Since I have the view_file output, I know line 654 is an extra </div>
const lines = content.split('\n');
if (lines[653].includes('</div>')) {
    lines.splice(653, 1);
    fs.writeFileSync(path, lines.join('\n'));
    console.log('Removed extra </div> at line 654');
} else {
    console.log('Line 654 did not contain </div>. Checking nearby lines...');
}
