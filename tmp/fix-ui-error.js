
const fs = require('fs');
const path = 'c:\\Users\\vamsi\\OneDrive\\Desktop\\HR\\HR\\app\\admin\\create-drive\\page.tsx';
let content = fs.readFileSync(path, 'utf8');

const target = 'const msg = error.details ? `${error.message}: ${error.details}` : error.message;';
const replacement = 'const msg = error.details ? `${error.message}: ${JSON.stringify(error.details)}` : error.message;';

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(path, content);
    console.log('Successfully updated page.tsx');
} else {
    console.log('Target string not found');
    console.log('Content slice around expected location:', content.indexOf('catch (error: any)'));
}
