# The web app, database scripts and MCP use the same Node.js runtime.
FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Compile native Node.js modules such as better-sqlite3.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
# tsx and TypeScript are needed at runtime by the existing scripts/config.
RUN npm ci --include=dev
COPY . .
RUN mkdir -p public
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    STUDY_FLOW_DATA_DIR=/app/data

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.ts /app/tsconfig.json ./
COPY --from=build /app/src ./src
COPY --from=build /app/mcp ./mcp
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/db ./db

EXPOSE 3030 3333
CMD ["sh", "-c", "npm run db:init && exec npx next start --hostname 0.0.0.0 --port 3030"]
