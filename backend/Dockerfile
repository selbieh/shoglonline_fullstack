# Multi-stage build (SRS §20.1) — non-root, slim
FROM python:3.12-slim AS base
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app

FROM base AS deps
COPY requirements/ requirements/
ARG REQUIREMENTS=requirements/production.txt
RUN pip install --no-cache-dir -r ${REQUIREMENTS}

FROM deps AS runtime
RUN addgroup --system app && adduser --system --ingroup app app
COPY --chown=app:app . .
USER app
EXPOSE 8000
COPY --chown=app:app entrypoint.sh /entrypoint.sh
ENTRYPOINT ["sh", "/entrypoint.sh"]
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3"]
