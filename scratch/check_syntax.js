const fs = require('fs');
const content = fs.readFileSync('app/admin/candidates/[id]/page.tsx', 'utf8');
try {
    // We can't really parse TSX easily with just node, but we can check for unclosed characters.
    let inString = false;
    let quoteChar = '';
    let inBrace = 0;
    let inParen = 0;
    let inTemplate = 0;
    
    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        if (char === '"' || char === "'") {
            if (!inString) {
                inString = true;
                quoteChar = char;
            } else if (quoteChar === char && content[i-1] !== '\\') {
                inString = false;
            }
        } else if (char === '`') {
            if (!inTemplate) inTemplate++;
            else if (content[i-1] !== '\\') inTemplate--;
        } else if (!inString && !inTemplate) {
            if (char === '{') inBrace++;
            if (char === '}') inBrace--;
            if (char === '(') inParen++;
            if (char === ')') inParen--;
        }
    }
    console.log({ inBrace, inParen, inTemplate, inString });
} catch (e) {
    console.error(e);
}
