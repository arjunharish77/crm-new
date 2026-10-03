"""Check opaque foreground/background token pairs in all eight theme modes.
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
        # (foreground, background, minimum). Text needs 4.5:1; control borders (--input) need
        # 3:1 against the surfaces they sit on (WCAG 1.4.11). UI/UX plan §10.3 pairs included.
        pairs = [('foreground', 'background', 4.5), ('muted-foreground', 'background', 4.5),
                 ('card-foreground', 'card', 4.5), ('primary-foreground', 'primary', 4.5),
                 ('secondary-foreground', 'secondary', 4.5), ('destructive-foreground', 'destructive', 4.5),
                 ('muted-foreground', 'card', 4.5), ('subtle-foreground', 'card', 4.5),
                 ('foreground', 'muted', 4.5), ('foreground', 'selected', 4.5),
                 ('primary', 'card', 4.5), ('primary', 'background', 4.5),
                 ('destructive', 'card', 4.5), ('input', 'card', 3), ('input', 'background', 3)]
        pairs += [('status-' + tone + '-foreground', 'status-' + tone, 4.5)
                  for tone in ['success', 'warning', 'danger', 'info', 'neutral', 'accent']]
        for fg, bg, minimum in pairs:
            low, high = sorted([luminance(resolve('--' + fg)), luminance(resolve('--' + bg))])
            ratio = (high + .05) / (low + .05)
            results.append(dict(palette=palette, mode=mode, foreground=fg, background=bg,
                                ratio=round(ratio, 2), status='passed' if ratio >= minimum else 'failed'))
out = Path('ui-audit-2026-09/phase-h-theme-reflow')
out.mkdir(parents=True, exist_ok=True)
(out / 'token-contrast.json').write_text(json.dumps(results, indent=2))
failures = [row for row in results if row['status'] == 'failed']
print(json.dumps(dict(checks=len(results), failures=failures)))
raise SystemExit(bool(failures))
