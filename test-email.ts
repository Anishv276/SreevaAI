import { config } from "dotenv";

// Load env FIRST
config({ path: ".env" });

async function run() {
    console.log("Sending test email...");
    
    // Dynamically import AFTER env is loaded so process.env is populated
    const { sendInterviewInviteEmail } = await import("./lib/mail");

    const res = await sendInterviewInviteEmail({
        email: "vamsivk1465@gmail.com",
        fullName: "Vamsi",
        jobTitle: "Senior AI Engineer",
        orgName: "Google DeepMind",
        interviewLink: "https://sreevaai.com/interview/test-id-1234",
        schedulingDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });
    console.log("Result:", res);
}

run().catch(console.error);
