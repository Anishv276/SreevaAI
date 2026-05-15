c = open('worker.ts','r',encoding='utf-8').read()

old = '''  }, {
    connection: redisConnection,
    concurrency: 1, // Keep one heavy scoring process per worker to avoid lock starvation
    lockDuration: 15 * 60 * 1000, // Scoring + extraction can exceed 60s on slower machines
    stalledInterval: 5 * 60 * 1000, // Check for stalled jobs every 5 min to reduce Redis writes
    maxStalledCount: 1,'''

new_code = '''  }, {
    connection: redisConnection,
    concurrency: 1, // Keep one heavy scoring process per worker to avoid lock starvation
    lockDuration: 15 * 60 * 1000, // Scoring + extraction can exceed 60s on slower machines
    stalledInterval: 5 * 60 * 1000, // Check for stalled jobs every 5 min to reduce Redis writes
    maxStalledCount: 1,
    drainDelay: 300, // Poll every 300ms — ensures jobs are picked up even if pub/sub event missed'''

count = c.count(old)
print(f'Found {count} occurrence(s)')
if count == 1:
    c = c.replace(old, new_code, 1)
    open('worker.ts','w',encoding='utf-8').write(c)
    print('Fixed: drainDelay added')
else:
    # Try \r\n variant
    old_crlf = old.replace('\n', '\r\n')
    count2 = c.count(old_crlf)
    print(f'CRLF variant: {count2} occurrence(s)')
    if count2 == 1:
        new_crlf = new_code.replace('\n', '\r\n')
        c = c.replace(old_crlf, new_crlf, 1)
        open('worker.ts','w',encoding='utf-8').write(c)
        print('Fixed with CRLF')
    else:
        # Find by stalledInterval line and insert drainDelay after
        idx = c.find('maxStalledCount: 1,')
        if idx != -1:
            insert_at = idx + len('maxStalledCount: 1,')
            c = c[:insert_at] + '\n    drainDelay: 300, // Poll every 300ms for remote Redis' + c[insert_at:]
            open('worker.ts','w',encoding='utf-8').write(c)
            print('Fixed by inserting after maxStalledCount')
        else:
            print('FAILED - could not find insertion point')
