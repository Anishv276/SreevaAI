import os

file_path = r'app/admin/settings/page.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
found = False
skip = 0

for i, line in enumerate(lines):
    if skip > 0:
        skip -= 1
        continue
        
    if "Promise.allSettled([" in line and "loadTeamData()" in lines[i+1]:
        found = True
        new_lines.append("            const dataSyncResults = await Promise.allSettled([\n")
        new_lines.append(lines[i+1])
        new_lines.append(lines[i+2])
        new_lines.append(lines[i+3])
        new_lines.append("            ]);\n")
        new_lines.append("\n")
        new_lines.append("            dataSyncResults.forEach((res, index) => {\n")
        new_lines.append("                if (res.status === \"rejected\") {\n")
        new_lines.append("                    console.error(`[SETTINGS_SYNC_ERROR_ID_${index}]:`, res.reason);\n")
        new_lines.append("                }\n")
        new_lines.append("            });\n")
        skip = 4 # Skip the original loadTeamData, fetchDomainInfo, fetchGoogleStatus, and ]);
    else:
        new_lines.append(line)

if found:
    with open(file_path, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    print("Successfully updated app/admin/settings/page.tsx")
else:
    print("Could not find Promise.allSettled block.")
