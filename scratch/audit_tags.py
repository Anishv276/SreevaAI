file_path = r'c:\Users\vamsi\OneDrive\Desktop\HR-updates\app\admin\candidates\[id]\page.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

start_line = 1438
end_line = 1826

content = "".join(lines[start_line-1:end_line])

div_opens = content.count('<div')
div_closes = content.count('</div')
brace_opens = content.count('{')
brace_closes = content.count('}')

print(f"Stats from line {start_line} to {end_line}:")
print(f"  <div (open): {div_opens}")
print(f"  </div (close): {div_closes}")
print(f"  {{ (open): {brace_opens}")
print(f"  }} (close): {brace_closes}")

# Check local balance
import re

# Simplify: just look for tags and braces in order
tokens = re.findall(r'<div|</div|{|}|&& \(|\)', content)
stack = []
for i, t in enumerate(tokens):
    if t == '<div' or t == '{' or t == '&& (':
        stack.append(t)
    elif t == '</div':
        if not stack or stack[-1] != '<div':
            print(f"Mismatch at token {i}: found </div but stack is {stack[-2:] if len(stack) > 1 else stack}")
        if stack: stack.pop()
    elif t == '}':
        if not stack or stack[-1] != '{':
            print(f"Mismatch at token {i}: found }} but stack is {stack[-2:] if len(stack) > 1 else stack}")
        if stack: stack.pop()
    elif t == ')':
        if not stack or stack[-1] != '&& (':
             print(f"Mismatch at token {i}: found ) but stack is {stack[-2:] if len(stack) > 1 else stack}")
        if stack: stack.pop()

print(f"Final stack after processing: {stack}")
