.PHONY: up down logs test lint seed superuser reset admin verify migrate-legacy

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

migrate-legacy: ## migrate legacy WP MySQL → app. Vars: DB_HOST [DB_PORT=3306] DB_NAME DB_USER DB_PASS [ARGS]
	@test -n "$(DB_HOST)" || { echo "set DB_HOST (and DB_NAME/DB_USER/DB_PASS). e.g.:"; \
	  echo '  make migrate-legacy DB_HOST=host.docker.internal DB_PORT=3307 DB_NAME=shogl DB_USER=user DB_PASS=password ARGS="--dry-run"'; exit 1; }
	docker compose exec -T backend python manage.py import_from_legacy \
	  --db-host "$(DB_HOST)" --db-port "$(or $(DB_PORT),3306)" --db-name "$(DB_NAME)" \
	  --db-user "$(DB_USER)" --db-password "$(DB_PASS)" $(ARGS)
