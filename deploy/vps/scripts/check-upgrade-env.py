#!/usr/bin/env python3
"""Check the existing VPS env without exposing values; optionally add one disabled default."""
import argparse
import datetime
import os
from pathlib import Path
import re
import shutil
parser = argparse.ArgumentParser()
parser.add_argument('--add-safe-defaults', action='store_true')
args = parser.parse_args()
p = Path(__file__).resolve().parent.parent / '.env'
if not p.is_file():
    raise SystemExit('Existing deploy/vps/.env is missing. Do not overwrite it with the example.')
text = p.read_text()
values = {}
for line in text.splitlines():
    match = re.match(r'^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$', line)
    if match:
        values[match[1]] = match[2].strip().strip('"\'')
# ML_SERVICE_SECRET: the ML service now refuses to start without it (it used to silently run
# unauthenticated). NODE_ENV: Compose now passes it explicitly to the website container, so an
# unset value would override the image's own NODE_ENV=production with an empty string.
required = ['APP_DOMAIN', 'API_DOMAIN', 'ACME_EMAIL', 'POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'REDIS_PASSWORD', 'DATABASE_URL', 'DIRECT_DATABASE_URL', 'REDIS_URL', 'JWT_SECRET', 'ML_SERVICE_SECRET', 'NODE_ENV']
# Not required: FILE_STORAGE_ROOT defaults to <cwd>/storage, i.e. /app/storage in the image
# (the mounted volume); APP_INTERNAL_URL is not read by any application code.
if values.get('UNNATIVIDYA_DOMAIN'):
    required += ['UNNATIVIDYA_DATABASE_URL', 'UNNATIVIDYA_SESSION_SECRET']
bad = [key for key in required if not values.get(key) or 'replace-with-' in values[key]]
if bad:
    raise SystemExit('Missing/placeholder values (values hidden): ' + ', '.join(bad))
if values.get('NODE_ENV') != 'production':
    raise SystemExit('NODE_ENV must be exactly "production" in deploy/vps/.env')
# Compose now hands most services an explicit variable list instead of the whole file. Any
# referenced name absent from .env becomes an empty string in that container; list them (names
# only) so an operator can confirm each is intentionally unset.
compose = (p.parent / 'docker-compose.yml').read_text()
referenced = sorted(set(re.findall(r'\$\{([A-Z][A-Z0-9_]*)\}', compose)))
unset = [key for key in referenced if key not in values]
if unset:
    print('Referenced by docker-compose.yml but not defined in .env (will be empty; fine only if intentionally unused): ' + ', '.join(unset))
if args.add_safe_defaults and 'UNNATIVIDYA_CMS_SETUP_TOKEN' not in values:
    backup = p.with_name('.env.before-upgrade-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    shutil.copy2(p, backup)
    os.chmod(backup, 0o600)
    with p.open('a') as out:
        out.write('\n# Blank keeps one-time website admin setup disabled. Existing admins are unaffected.\nUNNATIVIDYA_CMS_SETUP_TOKEN=\n')
    os.chmod(p, 0o600)
    print('Added disabled default: UNNATIVIDYA_CMS_SETUP_TOKEN. Existing values were preserved; backup created.')
else:
    print('No environment values changed.')
print('Required environment keys are present; values are not displayed.')
print('Duplicate rules and create APIs require no new secrets. Preserve JWT and encryption/signing keys.')
