content = open('worker.ts', 'r', encoding='utf-8').read()

# Fix the broken resumeUrl lookup inside processDriveResumeBatchJob (the app lookup after scoring)
bad_lookup = (
    "          const app = await prisma.application.findFirst({\r\n"
    "            where: {\r\n"
    "              resumeUrl: { contains: `candidateId=${candidate.id}` },\r\n"
    "            },\r\n"
    "            select: { id: true },\r\n"
    "          });"
)

good_lookup = (
    "          const app = await prisma.application.findFirst({\r\n"
    "            where: {\r\n"
    "              OR: [\r\n"
    "                { resumeUrl: { contains: candidate.id } },\r\n"
    "                { resumeData: { contains: candidate.id } },\r\n"
    "              ],\r\n"
    "            },\r\n"
    "            select: { id: true },\r\n"
    "          });"
)

count = content.count(bad_lookup)
print(f'Found {count} occurrences of bad lookup')
if count > 0:
    content = content.replace(bad_lookup, good_lookup)
    open('worker.ts', 'w', encoding='utf-8').write(content)
    print('Fixed!')
else:
    # Try with \n instead of \r\n
    bad2 = (
        "          const app = await prisma.application.findFirst({\n"
        "            where: {\n"
        "              resumeUrl: { contains: `candidateId=${candidate.id}` },\n"
        "            },\n"
        "            select: { id: true },\n"
        "          });"
    )
    count2 = content.count(bad2)
    print(f'Found {count2} occurrences with \\n')
    if count2 > 0:
        good2 = (
            "          const app = await prisma.application.findFirst({\n"
            "            where: {\n"
            "              OR: [\n"
            "                { resumeUrl: { contains: candidate.id } },\n"
            "                { resumeData: { contains: candidate.id } },\n"
            "              ],\n"
            "            },\n"
            "            select: { id: true },\n"
            "          });"
        )
        content = content.replace(bad2, good2)
        open('worker.ts', 'w', encoding='utf-8').write(content)
        print('Fixed with \\n!')
    else:
        # Just search for the line
        idx = content.find("resumeUrl: { contains: `candidateId=")
        if idx != -1:
            print(f'Found at {idx}:', repr(content[idx-200:idx+200]))
        else:
            print('NOT FOUND at all - already fixed or different pattern')
