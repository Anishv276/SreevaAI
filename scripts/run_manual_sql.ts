import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const prisma = new PrismaClient()
async function main() {
  const sqlDir = path.join(__dirname, '../prisma/manual_sql')
  const files = fs.readdirSync(sqlDir).filter(f => f.endsWith('.sql'))
  for (const file of files) {
    console.log(`\n--- Processing ${file} ---`)
    const content = fs.readFileSync(path.join(sqlDir, file), 'utf8')
    // Robust splitting logic for SQL statements, handling dollar-quoted blocks ($$ ... $$) and strings
    const statements: string[] = [];
    let currentStatement = "";
    let inDollarBlock = false;
    let inString = false;
    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        const nextChar = content[i + 1];
        currentStatement += char;
        // Toggle string state (')
        if (char === "'" && (i === 0 || content[i-1] !== "\\") && !inDollarBlock) {
            inString = !inString;
        }
        // Toggle dollar block state ($$)
        if (char === "$" && nextChar === "$" && !inString) {
            inDollarBlock = !inDollarBlock;
            currentStatement += nextChar;
            i++; // Skip the next $
            continue;
        }
        // Check for semicolon outside of blocks/strings
        if (char === ";" && !inDollarBlock && !inString) {
            statements.push(currentStatement.trim());
            currentStatement = "";
        }
    }
    if (currentStatement.trim()) statements.push(currentStatement.trim());
    for (const rawStatement of statements) {
        const statement = rawStatement.trim();
        if (!statement || statement === ";") continue;
      try {
        await prisma.$executeRawUnsafe(statement)
        console.log(`Successfully executed statement: ${statement.substring(0, 50)}...`)
      } catch (e: any) {
        if (e.message.includes('already exists') || e.message.includes('duplicate column')) {
          console.log(`Skipping (already exists): ${statement.substring(0, 50)}...`)
        } else {
          console.error(`Error executing statement in ${file}:`, e.message)
        }
      }
    }
  }
}
main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
