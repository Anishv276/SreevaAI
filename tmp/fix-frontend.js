
const fs = require('fs');
const path = 'app/admin/candidates/page.tsx';
let content = fs.readFileSync(path, 'utf8');

const target = `                                    const mainStatus =
                                        candidate.status === "Rejected"
                                            ? "Rejected"
                                            : candidate.status === "Borderline"
                                                ? "Borderline"
                                                : "Shortlisted";`;

const replacement = `                                    const mainStatus = candidate.status;`;

if (content.indexOf(target) !== -1) {
    content = content.replace(target, replacement);
    fs.writeFileSync(path, content);
    console.log('Successfully replaced status logic.');
} else {
    console.log('Target string not found. Checking for slightly different spacing...');
    // Try a more flexible replacement
    const flexibleTarget = /const mainStatus =\s+candidate\.status === "Rejected"\s+\? "Rejected"\s+: candidate\.status === "Borderline"\s+\? "Borderline"\s+: "Shortlisted";/m;
    if (flexibleTarget.test(content)) {
        content = content.replace(flexibleTarget, 'const mainStatus = candidate.status;');
        fs.writeFileSync(path, content);
        console.log('Successfully replaced status logic using flexible regex.');
    } else {
        console.log('Could not find target even with flexible regex.');
    }
}
