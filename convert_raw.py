import re
from bs4 import BeautifulSoup
def process():
    with open('stitch_raw.html', 'r', encoding='utf-8') as f:
        html = f.read()
    # Hardcoded config from the HTML
    colors = {
        "primary-container": "#ff6a00", "surface-container-low": "#f6f3f2", "on-background": "#1c1b1b",
        "on-error-container": "#93000a", "on-secondary-fixed": "#360f00", "on-primary-fixed": "#351000",
        "surface": "#fcf9f8", "surface-variant": "#e5e2e1", "on-secondary-fixed-variant": "#7c2e00",
        "tertiary-fixed-dim": "#9ccaff", "inverse-surface": "#313030", "secondary-container": "#fd6c1a",
        "on-surface-variant": "#5a4136", "primary-fixed": "#ffdbcc", "surface-dim": "#dcd9d9",
        "on-surface": "#1c1b1b", "on-primary": "#ffffff", "surface-tint": "#a14000",
        "outline-variant": "#e2bfb0", "on-primary-fixed-variant": "#7b2f00",
        "surface-container-lowest": "#ffffff", "on-tertiary": "#ffffff",
        "on-primary-container": "#571f00", "outline": "#8e7164", "surface-container-highest": "#e5e2e1",
        "inverse-primary": "#ffb694", "error-container": "#ffdad6", "on-secondary-container": "#581e00",
        "error": "#ba1a1a", "secondary": "#a33e00", "tertiary-fixed": "#d0e4ff",
        "surface-container-high": "#ebe7e7", "secondary-fixed-dim": "#ffb596", "tertiary": "#0062a1",
        "primary-fixed-dim": "#ffb694", "on-tertiary-container": "#003357", "on-secondary": "#ffffff",
        "primary": "#a14000", "on-tertiary-fixed": "#001d35", "secondary-fixed": "#ffdbcd",
        "tertiary-container": "#009eff", "background": "#fcf9f8", "surface-container": "#f0edec",
        "surface-bright": "#fcf9f8", "inverse-on-surface": "#f3f0ef",
        "on-tertiary-fixed-variant": "#00497a", "on-error": "#ffffff"
    }
    spacing = {
        "xl": "80px", "lg": "48px", "container-max": "1280px", "sm": "12px",
        "md": "24px", "gutter": "24px", "base": "8px", "xs": "4px"
    }
    font_sizes = {
        "label-sm": "text-[14px] leading-[1] tracking-[0.02em] font-[500]",
        "body-md": "text-[16px] leading-[1.6] font-[400]",
        "body-lg": "text-[18px] leading-[1.6] font-[400]",
        "h3": "text-[24px] leading-[1.3] tracking-[-0.01em] font-[600]",
        "h2": "text-[32px] leading-[1.25] tracking-[-0.01em] font-[600]",
        "h1": "text-[48px] leading-[1.2] tracking-[-0.02em] font-[700]",
        "display": "text-[64px] leading-[1.1] tracking-[-0.02em] font-[700]",
        "caption": "text-[12px] leading-[1.4] font-[400]"
    }
    def map_class(c):
        # Handle opacity split
        opacity = ""
        base_class = c
        if "/" in c:
            base_class, op = c.split("/", 1)
            opacity = f"/{op}"
        # Colors
        prefixes = ['bg', 'text', 'border', 'ring', 'from', 'to', 'divide', 'placeholder']
        for p in prefixes:
            if base_class.startswith(f"{p}-"):
                color_name = base_class[len(p)+1:]
                if color_name in colors:
                    return f"{p}-[{colors[color_name]}]{opacity}"
        # Spacing
        space_prefixes = ['p', 'px', 'py', 'pt', 'pb', 'pl', 'pr', 
                          'm', 'mx', 'my', 'mt', 'mb', 'ml', 'mr',
                          'gap', 'gap-x', 'gap-y', 'w', 'h', 'top', 'bottom', 'left', 'right']
        for p in space_prefixes:
            if base_class.startswith(f"{p}-"):
                space_name = base_class[len(p)+1:]
                if space_name in spacing:
                    return f"{p}-[{spacing[space_name]}]"
        # Font sizes
        if base_class.startswith("text-") and base_class[5:] in font_sizes:
            return font_sizes[base_class[5:]]
        # Font families
        if base_class.startswith("font-"):
            if base_class[5:] in ['label-sm', 'body-md', 'body-lg', 'h3', 'h2', 'h1', 'display', 'caption', 'inter']:
                return "font-sans"
        return c
    soup = BeautifulSoup(html, 'html.parser')
    for tag in soup.find_all(True):
        if tag.get('class'):
            new_classes = []
            for c in tag.get('class'):
                if ':' in c:
                    parts = c.split(':')
                    variant = ":".join(parts[:-1])
                    rest = parts[-1]
                    mapped = map_class(rest)
                    new_classes.append(" ".join(f"{variant}:{m}" for m in mapped.split(" ")))
                else:
                    new_classes.append(map_class(c))
            tag['className'] = " ".join(new_classes)
            del tag['class']
        if tag.name == 'img':
            if tag.get('src'):
                tag['src'] = tag.get('src')
        attrs_to_rename = {
            'stroke-width': 'strokeWidth',
            'stroke-linecap': 'strokeLinecap',
            'stroke-linejoin': 'strokeLinejoin',
            'fill-rule': 'fillRule',
            'clip-rule': 'clipRule',
            'viewbox': 'viewBox',
            'for': 'htmlFor',
            'tabindex': 'tabIndex'
        }
        for old, new in attrs_to_rename.items():
            if tag.get(old):
                tag[new] = tag.get(old)
                del tag[old]
    body = soup.find('body')
    styles = soup.find('style')
    style_content = styles.string if styles else ""
    jsx_content = ""
    for child in body.children:
        if child.name == 'script': continue
        jsx_content += str(child)
    jsx_content = re.sub(r'<img([^>]+)>', r'<img\1 />', jsx_content)
    jsx_content = re.sub(r'<input([^>]+)>', r'<input\1 />', jsx_content)
    jsx_content = re.sub(r'<br([^>]*)>', r'<br\1 />', jsx_content)
    jsx_content = re.sub(r'<hr([^>]*)>', r'<hr\1 />', jsx_content)
    # Also replace class= with className= for any stragglers
    jsx_content = jsx_content.replace(' class=', ' className=')
    jsx_content = jsx_content.replace('&amp;', '&').replace('&nbsp;', ' ')
    jsx_content = re.sub(r'<!--(.*?)-->', r'{/*\1*/}', jsx_content, flags=re.DOTALL)
    final_file = f"""import React from 'react';
export default function LandingPage() {{
  return (
    <>
      <style dangerouslySetInnerHTML={{{{__html: `{style_content}`}}}} />
      <div className="{body.get('className', '')}">
        {jsx_content}
      </div>
    </>
  );
}}
"""
    with open('app/page.tsx', 'w', encoding='utf-8') as f:
        f.write(final_file)
    print("Successfully converted and saved to app/page.tsx")
process()