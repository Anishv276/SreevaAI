const fs = require('fs');
const path = require('path');

const routePath = path.join(__dirname, '..', 'app', 'api', 'drives', '[id]', 'route.ts');
let content = fs.readFileSync(routePath, 'utf8');

// 1. Unconditionalize aiScreening in GET
content = content.replace(/enabled: \(drive as any\)\.aiScreeningEnabled \?\? true,/g, 'enabled: true,');

// 2. Remove interviewEnabled from PATCH
content = content.replace(/if \(data\.interviewEnabled !== undefined\) updateData\.interviewEnabled = data\.interviewEnabled;/g, '');

// 3. Remove aiScreeningEnabled from PATCH (if not already removed)
content = content.replace(/if \(data\.aiScreening\?\.enabled !== undefined\) updateData\.aiScreeningEnabled = data\.aiScreening\.enabled;/g, '');

fs.writeFileSync(routePath, content);
console.log('app/api/drives/[id]/route.ts cleaned up successfully.');
