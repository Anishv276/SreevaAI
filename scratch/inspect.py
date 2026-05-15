c = open('worker.ts','r',encoding='utf-8').read()

# Find the Worker options — search for 'concurrency' which is typical
idx = c.find('concurrency')
print('concurrency at:', idx)
if idx != -1:
    print(c[max(0,idx-200):idx+300])

print('\n\n--- Also searching drainDelay ---')
idx2 = c.find('drainDelay')
print('drainDelay at:', idx2)

print('\n\n--- Also searching for }, { near Worker ---')
# Find the closing of the worker callback + options object
idx3 = c.find("}, {\n    connection")
print('connection option at:', idx3)
if idx3 != -1:
    print(c[idx3:idx3+200])
    
# Search for the pattern where worker options are passed
import re
matches = list(re.finditer(r'new Worker\([^)]{0,200}connection', c))
print(f'\nFound {len(matches)} Workers with connection option')
for m in matches:
    print(' at', m.start(), ':', repr(c[m.start():m.start()+100]))