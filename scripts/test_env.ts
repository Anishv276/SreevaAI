import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
console.log('Checking for .env at:', envPath);
console.log('File exists:', fs.existsSync(envPath));

if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    console.log('File size:', content.length);
    console.log('First 50 chars of content (escaped):', JSON.stringify(content.substring(0, 50)));
    
    const result = dotenv.config();
    if (result.error) {
        console.error('Dotenv error:', result.error);
    } else {
        console.log('Dotenv parsed keys:', Object.keys(result.parsed || {}));
    }
}

console.log('process.env.OPENAI_API_KEY exists:', !!process.env.OPENAI_API_KEY);
