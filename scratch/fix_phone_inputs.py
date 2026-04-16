import re
import os

def fix_file(path, pattern, replacement):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    new_content = re.sub(pattern, replacement, content, flags=re.DOTALL)
    
    if new_content == content:
        print(f"No changes made to {path}. Pattern might not match.")
        return False
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"Successfully updated {path}")
    return True

# 1. Settings Page Fix
settings_pattern = r'<Field label="Phone Number">.*?</Field>'
settings_replacement = """<Field label="Phone Number">
                                             <PhoneInput
                                                 value={profile.phone}
                                                 onChange={val => setProfile(p => ({ ...p, phone: val }))}
                                                 className="mt-1"
                                             />
                                         </Field>"""

# 2. Setup Page Fix
setup_pattern = r'<label className="text-\[12px\] font-bold text-gray-500 uppercase tracking-widest">Phone Number</label>.*?<div className="relative">.*?<input.*?value={profile\.phone}.*?onChange={e => setProfile\({ \.\.\.profile, phone: e\.target\.value }\)}.*?/>.*?</div>'
setup_replacement = """<label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest">Phone Number</label>
                                         <PhoneInput
                                             value={profile.phone}
                                             onChange={val => setProfile({ ...profile, phone: val })}
                                             className="mt-1"
                                         />"""

fix_file('app/admin/settings/page.tsx', settings_pattern, settings_replacement)
fix_file('app/admin/setup/page.tsx', setup_pattern, setup_replacement)
