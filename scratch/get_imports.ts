import fs from "fs";

const content = fs.readFileSync("c:/Users/vamsi/OneDrive/Desktop/HR-updates/components/admin/candidate-profile/interview-report-sreevaai.tsx", "utf8");
const lines = content.split("\n");
for (let i = 0; i < 50; i++) {
  console.log(`${i + 1}: ${lines[i]}`);
}
