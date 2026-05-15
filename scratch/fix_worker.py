import sys

content = open('worker.ts', 'r', encoding='utf-8').read()

# Find the start of the corrupted runPythonJson function
start_marker = 'async function runPythonJson(args: string[], timeoutMs = 180000): Promise<any> {'
# Find the end - it ends just before 'async function processDriveResumeBatchJob'
end_marker = '\nasync function processDriveResumeBatchJob'

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx == -1:
    print('ERROR: start marker not found')
    sys.exit(1)
if end_idx == -1:
    print('ERROR: end marker not found')
    sys.exit(1)

print(f'Found corrupted block from char {start_idx} to {end_idx}')
print('CURRENT BLOCK:')
print(repr(content[start_idx:end_idx]))

# Replace the entire corrupted block with the correct two functions
replacement = '''async function runPythonJson(args: string[], timeoutMs = 180000): Promise<any> {
  return new Promise((resolve, reject) => {
    let out = "";
    let err = "";
    const p = spawn(pythonCmd, args);
    const timer = setTimeout(() => {
      p.kill();
      reject(new Error(`python timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    p.stdout.on("data", (data) => { out += data.toString(); });
    p.stderr.on("data", (data) => { err += data.toString(); });
    p.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(err || `python exited ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(out));
      } catch (e: any) {
        reject(new Error(`Invalid python JSON: ${e.message}`));
      }
    });
    p.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function setDriveCandidateStage(
  candidateId: string,
  stage: string,
  progress: number,
  resumeStatus: string
) {
  const payload = JSON.stringify({ processing: { stage, progress } });

  // Always update ResumeCandidates first (never fails)
  await prisma.resumeCandidate.update({
    where: { id: candidateId },
    data: { resumeStatus, aiScore: progress, aiReport: payload },
  });

  // Find linked Application. Upload API stores candidateId inside resumeData JSON.
  // Search both resumeUrl and resumeData to be resilient across all upload flows.
  let app: { id: string } | null = null;
  try {
    app = await prisma.application.findFirst({
      where: {
        OR: [
          { resumeUrl: { contains: candidateId } },
          { resumeData: { contains: candidateId } },
        ],
      },
      select: { id: true },
    });
  } catch {
    // Ignore lookup errors — ResumeCandidates is already updated above.
  }

  if (app?.id) {
    await prisma.application.update({
      where: { id: app.id },
      data: { resumeStatus, aiScore: progress, aiReport: payload },
    });
  }
}'''

new_content = content[:start_idx] + replacement + content[end_idx:]
open('worker.ts', 'w', encoding='utf-8').write(new_content)
print('SUCCESS: worker.ts fixed')
