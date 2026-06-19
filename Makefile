.PHONY: up down logs test lint seed superuser reset admin verify

up:            ## start the full stack
	docker compose up -d --build

down:
	docker compose down

reset:         ## DANGER: wipe DB volume + rebuild from scratch (fixes stale/mismatched Postgres)
	docker compose down -v
	docker compose up -d --build

admin:         ## create a default dev admin (admin@shoghlonline.com / admin12345)
	docker compose exec -T \
	  -e DJANGO_SUPERUSER_EMAIL=admin@shoghlonline.com \
	  -e DJANGO_SUPERUSER_PASSWORD=admin12345 \
	  backend python manage.py createsuperuser --noinput || true

verify:        ## wait for services then check API + admin reachable
	@echo "waiting for backend…"; sleep 8
	@docker compose exec -T backend python manage.py migrate --check && echo "✅ migrations applied"
	@curl -fsS http://localhost:8000/api/v1/settings/public >/dev/null && echo "✅ API up (localhost:8000)"
	@curl -fsS -o /dev/null http://localhost:3000 && echo "✅ frontend up (localhost:3000)" || echo "⚠️ frontend still building"

logs:
	docker compose logs -f backend frontend

test:          ## backend tests
	docker compose exec backend python -m pytest

lint:
	docker compose exec backend python -m ruff check .
	docker compose exec frontend npx tsc --noEmit

seed:
	docker compose exec backend python manage.py makemigrations
	docker compose exec backend python manage.py migrate          ## seed global settings (SRS §22.1)
	docker compose exec backend python manage.py seed_settings
	docker compose exec backend python manage.py seed

superuser:     ## create an admin (staff) account — FR-AUTH-8
	docker compose exec backend python manage.py createsuperuser
