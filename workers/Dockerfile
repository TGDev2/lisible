FROM node:20-bookworm-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /app

# Monorepo install (workspace dependencies required by @sme-studio/workers)
COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @sme-studio/workers... build

ENV NODE_ENV=production

CMD ["pnpm", "--filter", "@sme-studio/workers", "start"]

