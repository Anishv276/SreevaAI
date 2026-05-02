import re

# Fix 1: assistant/route.ts — chatbot fallback from gpt-4o-mini to gpt-4.1-mini
path1 = r'c:\Users\vamsi\OneDrive\Desktop\HR-updates\app\api\admin\assistant\route.ts'
with open(path1, 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace('return "gpt-4o-mini";', 'return "gpt-4.1-mini";', 1)
with open(path1, 'w', encoding='utf-8') as f:
    f.write(content)
print('assistant/route.ts updated:', 'gpt-4.1-mini' in content)

# Fix 2: admin/chat/route.ts — chatbot fallback from gpt-4o-mini to gpt-4.1-mini
path2 = r'c:\Users\vamsi\OneDrive\Desktop\HR-updates\app\api\admin\chat\route.ts'
with open(path2, 'r', encoding='utf-8') as f:
    content2 = f.read()
content2 = content2.replace('"gpt-4o-mini"', '"gpt-4.1-mini"')
with open(path2, 'w', encoding='utf-8') as f:
    f.write(content2)
print('admin/chat/route.ts updated:', 'gpt-4.1-mini' in content2)
