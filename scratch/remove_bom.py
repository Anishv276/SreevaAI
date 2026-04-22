import os

path = 'worker.ts'
with open(path, 'rb') as f:
    content = f.read()

if content.startswith(b'\xef\xbb\xbf'):
    print("BOM found. Removing...")
    with open(path, 'wb') as f:
        f.write(content[3:])
    print("BOM removed successfully.")
else:
    print("No BOM found in worker.ts.")
