import re
import os

def convert_html_to_jsx(filepath, output_path):
    with open(filepath, 'r', encoding='utf-8') as f:
        html = f.read()

    # Extract body inner HTML
    body_match = re.search(r'<body[^>]*>(.*?)</body>', html, re.DOTALL | re.IGNORECASE)
    if body_match:
        jsx = body_match.group(1)
    else:
        jsx = html

    # Convert class to className
    jsx = jsx.replace('class="', 'className="')
    jsx = jsx.replace('for="', 'htmlFor="')
    jsx = jsx.replace('tabindex="', 'tabIndex="')
    jsx = jsx.replace('autocomplete="', 'autoComplete="')
    jsx = jsx.replace('autofocus="', 'autoFocus="')

    # Convert SVG attributes to camelCase
    svg_attrs = [
        'stroke-width', 'stroke-linecap', 'stroke-linejoin',
        'fill-rule', 'clip-rule', 'stroke-miterlimit', 'stroke-dasharray',
        'stroke-dashoffset', 'stop-color', 'stop-opacity'
    ]
    for attr in svg_attrs:
        camel = attr.split('-')
        camel = camel[0] + ''.join(word.capitalize() for word in camel[1:])
        jsx = jsx.replace(f'{attr}="', f'{camel}="')

    jsx = re.sub(r'\bviewbox=', 'viewBox=', jsx, flags=re.IGNORECASE)

    # Convert inline styles
    def style_replacer(match):
        style_str = match.group(1)
        rules = [r.strip() for r in style_str.split(';') if r.strip()]
        react_styles = []
        for rule in rules:
            if ':' in rule:
                k, v = rule.split(':', 1)
                k = k.strip()
                v = v.strip()
                k_parts = k.split('-')
                k_camel = k_parts[0] + ''.join(p.capitalize() for p in k_parts[1:])
                react_styles.append(f"{k_camel}: '{v}'")
        return 'style={{' + ', '.join(react_styles) + '}}'

    jsx = re.sub(r'style="([^"]*)"', style_replacer, jsx)

    # Self-close void elements
    void_elements = ['img', 'input', 'hr', 'br', 'source', 'meta', 'link']
    for tag in void_elements:
        jsx = re.sub(rf'<{tag}([^>]*?)(?<!/)>', rf'<{tag}\1 />', jsx, flags=re.IGNORECASE)

    # Also handle HTML comments
    jsx = re.sub(r'<!--(.*?)-->', r'{/* \1 */}', jsx, flags=re.DOTALL)

    output = f"""import React from 'react';
import Link from 'next/link';

export default function LandingPage() {{
  return (
    <>
      {{/* Extracted from Stitch HTML */}}
      {jsx}
    </>
  );
}}
"""

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(output)

workspace = r'c:\Users\vamsi\OneDrive\Desktop\HR-updates'
convert_html_to_jsx(os.path.join(workspace, 'stitch_landing_page.html'), os.path.join(workspace, 'app', 'page.tsx'))
print("Successfully converted and saved to app/page.tsx")
