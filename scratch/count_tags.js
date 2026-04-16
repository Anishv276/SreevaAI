const fs = require('fs');
const code = fs.readFileSync('app/super-admin/orgs/[id]/page.tsx', 'utf8');

function countTags(str) {
    const openDivs = (str.match(/<div/g) || []).length;
    const closeDivs = (str.match(/<\/div>/g) || []).length;
    const openForms = (str.match(/<form/g) || []).length;
    const closeForms = (str.match(/<\/form>/g) || []).length;
    const openBraces = (str.match(/{/g) || []).length;
    const closeBraces = (str.match(/}/g) || []).length;

    console.log(`Divs: Open=${openDivs}, Close=${closeDivs}`);
    console.log(`Forms: Open=${openForms}, Close=${closeForms}`);
    console.log(`Braces: Open=${openBraces}, Close=${closeBraces}`);
}

countTags(code);
