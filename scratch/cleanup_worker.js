const fs = require('fs');
const path = require('path');

const workerPath = path.join(__dirname, '..', 'worker.ts');
let content = fs.readFileSync(workerPath, 'utf8');

// 1. Remove interviewEnabled from select
content = content.replace(/interviewEnabled:\s*true,\s*\n/g, '');

// 2. Remove isInterviewEnabled definition
content = content.replace(/\/\/ Read interviewEnabled from DB \(already fetched above\); default true for backward compat\.\s*\n\s*const isInterviewEnabled = latestDrive\?\.interviewEnabled \?\? true;\s*\n/g, '');

// 3. Remove isInterviewEnabled from if condition
content = content.replace(/if\s*\(resumeStatus\s*===\s*'SHORTLISTED'\s*&&\s*isInterviewEnabled\)/g, "if (resumeStatus === 'SHORTLISTED')");

// 4. Cleanup log message
content = content.replace(/-- interview disabled: \${!isInterviewEnabled},/g, '');

fs.writeFileSync(workerPath, content);
console.log('Worker.ts cleaned up successfully.');
