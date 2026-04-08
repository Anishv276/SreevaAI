
const fs = require('fs');
const path = 'app/admin/candidates/page.tsx';
let content = fs.readFileSync(path, 'utf8');

const badgeRegex = /mainStatus === 'Shortlisted' \? 'bg-green-50 text-green-700' :\s+mainStatus === 'Rejected' \? 'bg-red-50 text-red-700' :\s+'bg-amber-50 text-amber-700'/g;

if (badgeRegex.test(content)) {
    content = content.replace(badgeRegex, "mainStatus === 'Rejected' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'");
    fs.writeFileSync(path, content);
    console.log('Successfully simplified badge colors.');
} else {
    console.log('Badge color logic matching failed.');
}
