content = open('worker.ts', 'r', encoding='utf-8').read()

# Find the corrupted block by anchor points
START = '          // Validate R2 key exists before downloading'
END   = '          tmpPdfPath = join(tmpdir()'

idx_start = content.find(START)
idx_end   = content.find(END)

if idx_start == -1 or idx_end == -1:
    print(f'Markers not found: start={idx_start}, end={idx_end}')
else:
    print(f'Replacing chars {idx_start} to {idx_end}')
    good_block = '''          // Download PDF from R2 — fast-fail if key was deleted
          let pdfBuffer: Buffer;
          try {
            pdfBuffer = await getObjectBuffer(bucket, key);
          } catch (r2Err: any) {
            const msg = String((r2Err as any)?.message || r2Err || '');
            if (msg.includes('does not exist') || msg.includes('NoSuchKey') || msg.includes('404') || msg.includes('specified key')) {
              console.error(`[RESUME-WORKER] R2 key missing for candidate ${candidate.id}: ${key}`);
              throw Object.assign(new Error(`R2 key no longer exists: ${key}`), { noRetry: true });
            }
            throw r2Err;
          }
          '''
    new_content = content[:idx_start] + good_block + content[idx_end:]
    open('worker.ts', 'w', encoding='utf-8').write(new_content)
    print('Fixed and saved.')
