const fs = require('fs');
const path = 'app/super-admin/orgs/[id]/page.tsx';
let content = fs.readFileSync(path, 'utf8');

function fixStructure(str) {
    // 1. Fix Section 1 missing closing tag (line 172)
    const section1End = '                {/* Primary HR Controller */}';
    if (str.includes(section1End) && !str.includes('</div>\n\n                ' + section1End)) {
        str = str.replace(section1End, '</div>\n\n                ' + section1End);
    }

    // 2. Fix Section 3 CARTESIA missing closing tag (line 344)
    // Looking for the end of CARTESIA block
    const cartesiaBlockEnd = '                            </div>\n                        )}\n\n                        {form.ttsProvider === "SARVAM"';
    if (str.includes(cartesiaBlockEnd)) {
        str = str.replace(cartesiaBlockEnd, '                            </div>\n                        </div>\n                    )}\n\n                        {form.ttsProvider === "SARVAM"');
    }

    return str;
}

const fixedContent = fixStructure(content);

const openDivs = (fixedContent.match(/<div(?!\w)/g) || []).length;
const closeDivs = (fixedContent.match(/<\/div>/g) || []).length;

console.log(`Open Divs: ${openDivs}, Close Divs: ${closeDivs}`);

if (openDivs === closeDivs) {
    fs.writeFileSync(path, fixedContent);
    console.log('Fixed file successfully');
} else {
    console.log('STILL NOT BALANCED. Manual fix required.');
}
