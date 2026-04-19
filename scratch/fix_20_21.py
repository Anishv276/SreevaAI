import re
import os

# Fix Error 20: app/careers/apply/page.tsx
careers_file = r'app/careers/apply/page.tsx'
if os.path.exists(careers_file):
    with open(careers_file, 'r', encoding='utf-8') as f:
        careers_content = f.read()
    
    careers_search = r'const nextStep = \(\) => setStep\(prev => prev \+ 1\);'
    careers_replace = '''const nextStep = () => {
        if (step === 1) {
            if (!formData.firstName || !formData.lastName || !formData.email || !formData.phone || !formData.location) {
                alert("Please fill in all required personal information fields.");
                return;
            }
        }
        if (step === 2) {
            if (!formData.qualification || !formData.experience || !formData.noticePeriod || !formData.expectedCtc) {
                alert("Please fill in all professional details before continuing.");
                return;
            }
        }
        setStep(prev => prev + 1);
    };'''
    
    new_careers = re.sub(careers_search, careers_replace, careers_content, count=1)
    if new_careers != careers_content:
        with open(careers_file, 'w', encoding='utf-8') as f:
            f.write(new_careers)
        print(f"Successfully fixed Error 20 in {careers_file}")

# Fix Error 21: app/admin/settings/page.tsx
settings_file = r'app/admin/settings/page.tsx'
if os.path.exists(settings_file):
    with open(settings_file, 'r', encoding='utf-8') as f:
        settings_content = f.read()

    # Finding the Promise.allSettled block in the background fetch
    settings_search = r'Promise\.allSettled\(\[\s*loadTeamData\(\),\s*fetchDomainInfo\(\),\s*fetchGoogleStatus\(\)\s*\]\)\.catch\(err => console\.error\("Secondary fetch failed:", err\)\);'
    settings_replace = '''const syncResults = await Promise.allSettled([
                loadTeamData(),
                fetchDomainInfo(),
                fetchGoogleStatus()
            ]);
            syncResults.forEach((res, i) => {
                if (res.status === 'rejected') {
                    console.error(`Settings data load [${i}] failed:`, res.reason);
                }
            });'''

    new_settings = re.sub(settings_search, settings_replace, settings_content, count=1, flags=re.DOTALL)
    if new_settings != settings_content:
        with open(settings_file, 'w', encoding='utf-8') as f:
            f.write(new_settings)
        print(f"Successfully fixed Error 21 in {settings_file}")
    else:
        print(f"Could not find Promise.allSettled block in {settings_file}")
