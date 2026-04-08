import { sendApplicationStatusEmail } from "../lib/mail";
import * as dotenv from "dotenv";
import { resolve } from "path";

// Load .env from root
dotenv.config({ path: resolve(__dirname, "../.env") });

async function runTest() {
    const testEmail = "vamsivk1465@gmail.com";
    const testName = "Vamsivk";
    const testJob = "Senior Full Stack Developer";
    const testScore = 92;
    const testLink = "http://localhost:3000/interview/test-session-id?token=test-token";

    console.log(`📧 Sending test AI Interview email to ${testEmail}...`);

    try {
        const result = await sendApplicationStatusEmail({
            email: testEmail,
            fullName: testName,
            jobTitle: testJob,
            status: "ACCEPTED",
            score: testScore,
            interviewLink: testLink
        });

        if (result.success) {
            console.log("✅ Success! Check your inbox (including spam).");
        } else {
            console.error("❌ Failed to send email:", result.error);
        }
    } catch (err) {
        console.error("💥 Execution error:", err);
    }
}

runTest();
