import sys

file_path = 'agent.py'
with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if line.strip() == 'import asyncio':
        new_lines.append('import asyncio\n')
        new_lines.append('\n')
        new_lines.append('if sys.platform == "win32":\n')
        new_lines.append('    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())\n')
    else:
        new_lines.append(line)

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Agent fix applied.")
