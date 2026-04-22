import { normalizeProctoringEvent } from "../lib/proctoring";
console.log("Testing Proctoring Normalization...");
const testEvents = [
    { eventType: "camera_disabled" },
    { eventType: "unknown_event" },
    { eventType: "" },
    { eventType: "tab switch", severity: "high" as any },
];
testEvents.forEach(e => {
    const norm = normalizeProctoringEvent(e as any);
    console.log(`Input: ${e.eventType} -> Output: ${norm.eventType} (Severity: ${norm.severity})`);
});