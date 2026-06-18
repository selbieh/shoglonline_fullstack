#!/bin/sh
set -e

python manage.py migrate --noinput
python manage.py seed_settings
python manage.py seed_catalog
python manage.py seed_landing
python manage.py collectstatic --noinput 2>/dev/null || true

exec "$@"
