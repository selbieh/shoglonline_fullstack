#!/bin/sh
set -e

# manage.py defaults to config.settings.local, but in the container every command
# must run under production (DEBUG=False, WhiteNoise + CompressedManifestStaticFilesStorage).
# Running collectstatic under local produced static files WITHOUT the hashed
# staticfiles.json manifest that the production storage requires at request time,
# which made WhiteNoise 404 every static asset. Honour a Railway-provided value if set.
export DJANGO_SETTINGS_MODULE="${DJANGO_SETTINGS_MODULE:-config.settings.production}"

python manage.py migrate --noinput
python manage.py seed_settings
python manage.py seed_catalog
python manage.py seed_landing
# No error suppression: a failing collectstatic must be loud, not silently skipped.
python manage.py collectstatic --noinput --clear

exec "$@"
