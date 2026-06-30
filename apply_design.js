const fs = require('fs');
let f = fs.readFileSync('components/admin/candidate-profile/interview-report-sreevaai.tsx', 'utf8');

// Replace standard card styles
f = f.replace(/className="([^"]*?)border border-\[#E4E7EB\] shadow-sm([^"]*?)"/g, 'className="$1$2" style={{ border: "1px solid #E9E7FF", boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}');
f = f.replace(/className="([^"]*?)border border-\[#E2E8F0\] shadow-sm([^"]*?)"/g, 'className="$1$2" style={{ border: "1px solid #E9E7FF", boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}');

// Update icon colors based on design system
// Sparkles with Amber (#F59E0B) -> Primary Violet (#7C3AED) or keep it if they want specific colors.
// "green, red and the colour we used" -> The design system uses #7C3AED for primary, #10B981 for success, #EF4444 for danger.
f = f.replace(/text-\[#8B5CF6\]/g, 'text-[#7C3AED]'); // Light violet to Primary Violet
f = f.replace(/text-\[#6366F1\]/g, 'text-[#7C3AED]'); // Indigo to Primary Violet
f = f.replace(/text-\[#F59E0B\]/g, 'text-[#7C3AED]'); // Amber to Primary Violet for Behavioral Analysis
f = f.replace(/text-\[#3B82F6\]/g, 'text-[#7C3AED]'); // Any blue sparkles to Primary violet

fs.writeFileSync('components/admin/candidate-profile/interview-report-sreevaai.tsx', f);
console.log('Done');
