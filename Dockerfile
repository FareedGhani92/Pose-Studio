FROM node:22-bookworm-slim AS frontend
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.19.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
COPY public ./public
COPY scripts/prepare-assets.mjs ./scripts/prepare-assets.mjs
RUN pnpm build

FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8000
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend ./backend
COPY --from=frontend /app/dist ./dist
RUN useradd --create-home appuser
USER appuser
EXPOSE 8000
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT}"]
