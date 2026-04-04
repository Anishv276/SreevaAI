import { AsyncOpenAI } from 'openai';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as re from 're'; // No need for re in TS, just placeholder

dotenv.config();
const prisma = new PrismaClient();
const openai = new AsyncOpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function runDemo() {
  console.log('🔍 Fetching the last transcript...');
  const interview = await prisma.interview.findFirst({
    where: { NOT: { interviewTranscript: null } },
    orderBy: { updatedAt: 'desc' }
  });

  if (!interview || !interview.interviewTranscript) {
    console.log('❌ No transcript found.');
    return;
  }

  console.log('🤖 Generating your new Narrative Summary...');
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are an expert hiring manager. Analyze the provided interview transcript for a GTM role. Provide a concise, professional narrative summary (4-5 sentences) highlighting the candidate's core competencies and a final hiring recommendation. DO NOT use JSON or scores." },
      { role: "user", content: interview.interviewTranscript }
    ]
  });

  const summary = response.choices[0].message.content;
  console.log('\n--- NEW AI SUMMARY ---');
  console.log(summary);
  console.log('----------------------');

  console.log('\n💾 Saving to your database...');
  await prisma.interview.update({
    where: { id: interview.id },
    data: { aiSummary: summary }
  });

  console.log('✅ Done! Check your Admin Dashboard.');
}

runDemo().catch(console.error);
