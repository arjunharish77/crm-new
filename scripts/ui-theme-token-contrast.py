"""Check six opaque foreground/background token pairs in all eight theme modes.
This checks token definitions, not complete rendered-page accessibility.
Run from the crm application directory with Python 3.
"""
import json
import re
from pathlib import Path

css = Path('src/app/globals.css').read_text()

def block(selector):
    match = re.search(r'(?:^|\n)' + re.escape(selector) + r'\s*\{([^}]+)\}', css)
    return dict(re.findall(r'(--[\w-]+):\s*([^;]+);', match.group(1))) if match else {}

def luminance(color):
    rgb = [int(color[i:i+2], 16) / 255 for i in (1, 3, 5)]
    return sum(w * (c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4)
               for c, w in zip(rgb, [.2126, .7152, .0722]))

results = []
for palette in ['forest', 'ocean', 'sunset', 'grape']:
    for mode in ['light', 'dark']:
        values = block(':root')
        if mode == 'dark':
            values.update(block('.dark'))
        if palette != 'forest':
            values.update(block(('html.dark' if mode == 'dark' else 'html') + '[data-color-theme="' + palette + '"]'))
        def resolve(key):
            value = values[key].strip()
            return resolve(value[4:-1]) if value.startswith('var(') else value
        for fg, bg in [('foreground', 'background'), ('muted-foreground', 'background'),
                       ('card-foreground', 'card'), ('primary-foreground', 'primary'),
                       ('secondary-foreground', 'secondary'), ('destructive-foreground', 'destructive')]:
            low, high = sorted([luminance(resolve('--' + fg)), luminance(resolve('--' + bg))])
            ratio = (high + .05) / (low + .05)
            results.append(dict(palette=palette, mode=mode, foreground=fg, background=bg,
                                ratio=round(ratio, 2), status='passed' if ratio >= 4.5 else 'failed'))
out = Path('ui-audit-2026-09/phase-h-theme-reflow')
out.mkdir(parents=True, exist_ok=True)
(out / 'token-contrast.json').write_text(json.dumps(results, indent=2))
failures = [row for row in results if row['status'] == 'failed']
print(json.dumps(dict(checks=len(results), failures=failures)))
raise SystemExit(bool(failures))
