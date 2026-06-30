# Multi-stage build (SRS §20.1) — non-root, slim
FROM python:3.12-slim AS base
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app

FROM base AS deps
# mysqlclient is a C extension: it needs the MySQL client headers + a compiler at build time.
# They stay in this stage; the runtime stage builds FROM deps, so the compiled wheel carries over.
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential default-libmysqlclient-dev pkg-config \
    && rm -rf /var/lib/apt/lists/*
COPY requirements/ requirements/
ARG REQUIREMENTS=requirements/production.txt
RUN pip install --no-cache-dir -r ${REQUIREMENTS}

FROM deps AS runtime
# gosu lets the entrypoint start as root (to fix mounted-volume ownership) and then drop
# privileges to the unprivileged app user for migrations, collectstatic and gunicorn.
RUN apt-get update \
    && apt-get install -y --no-install-recommends gosu \
    && rm -rf /var/lib/apt/lists/*
RUN addgroup --system app && adduser --system --ingroup app app
RUN mkdir -p /home/app/.gunicorn && chown -R app:app /home/app
# STATIC_ROOT (/app/staticfiles) and MEDIA_ROOT (/app/media) are gitignored, so they are
# absent from the build context. Create + own them here; otherwise collectstatic fails with
# PermissionError because /app itself is root-owned and the app user cannot mkdir under it.
RUN mkdir -p /app/staticfiles /app/media && chown -R app:app /app/staticfiles /app/media
COPY --chown=app:app . .
ENV HOME=/home/app
EXPOSE 8000
# Persist uploads across deploys. Attach a managed volume here (Railway: set the mount path
# to /app/media; compose: see the media volume in docker-compose). The entrypoint re-chowns
# it to app at boot because volumes mount as root:root.
VOLUME ["/app/media"]
COPY entrypoint.sh /entrypoint.sh
# No `USER app`: the entrypoint starts as root to chown mounted volumes, then uses gosu to
# run every command (and gunicorn) as the unprivileged app user.
ENTRYPOINT ["sh", "/entrypoint.sh"]
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3"]
