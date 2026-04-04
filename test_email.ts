import { sendApplicationStatusEmail } from './lib/mail';
import * as dotenv from 'dotenv';

dotenv.config();

async function testEmail() {
    console.log("Sending test REJECTED email...");
    const result = await sendApplicationStatusEmail({
        email: "vamsikrishna2536@gmail.com",
        fullName: "Test User",
        jobTitle: "Software Engineer (Test)",
        status: "REJECTED",
        score: 45
    });
    console.log("Email Result:", result);
}

testEmail();
