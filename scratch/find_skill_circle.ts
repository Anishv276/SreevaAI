import fs from "fs";

const content = fs.readFileSync("c:/Users/vamsi/OneDrive/Desktop/HR-updates/components/admin/candidate-profile/interview-report-sreevaai.tsx", "utf8");
const lines = content.split("\n");
lines.forEach((line, idx) => {
  if (line.includes("function SkillCircle") || line.includes("const SkillCircle")) {
    console.log(`${idx + 1}: ${line}`);
  }
});
