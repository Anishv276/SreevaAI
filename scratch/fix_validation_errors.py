import re
import os

files = {
    r'app/careers/apply/page.tsx': {
        'search': r'const nextStep = \(\) => setStep\(prev => prev \+ 1\);',
        'replace': '''const nextStep = () => {
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
    },
    r'app/admin/settings/page.tsx': {
        'search': r'Promise\.allSettled\(\[\s*loadTeamData\(\),\s*fetchDomainInfo\(\),\s*fetchGoogleStatus\(\)\s*\]\);',
        'replace': '''const dataSyncResults = await Promise.allSettled([
                loadTeamData(),
                fetchDomainInfo(),
                fetchGoogleStatus()
            ]);
            
            dataSyncResults.forEach((res, index) => {
                if (res.status === "rejected") {
                    console.error(`[SETTINGS_SYNC_ERROR_ID_${index}]:`, res.reason);
                }
            });'''
    }
}

def apply_fix(file_path):
    if not os.path.exists(file_path):
        print(f"File not found: {file_path}")
        return
        
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    data = files[file_path]
    # Use re.sub with re.DOTALL for the settings page because it crosses lines
    if file_path == 'app/admin/settings/page.tsx':
        new_content = re.sub(data['search'], data['replace'], content, count=1, flags=re.DOTALL)
    else:
        new_content = re.sub(data['search'], data['replace'], content, count=1)
        
    if new_content != content:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Successfully updated {file_path}")
    else:
        print(f"Could not find pattern in {file_path}")

apply_fix('app/careers/apply/page.tsx')
apply_fix('app/admin/settings/page.tsx')
