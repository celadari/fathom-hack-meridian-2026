# Fathom demo server (testnet only): admin/bot/attacker actions for the app's ?demo controls,
# plus the auction loop. Keys come from FATHOM_KEY_* secrets; state lives on a volume at /data.
FROM node:24-slim
WORKDIR /app/scripts
COPY scripts/package.json scripts/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY scripts/ ./
COPY deployments/ /app/deployments/
ENV HOST=0.0.0.0 \
    PORT=8787 \
    DEMO_LOOP=1 \
    FATHOM_KEYS_FROM_ENV_ONLY=1 \
    FATHOM_STATE_DIR=/data
EXPOSE 8787
CMD ["npx", "tsx", "demo-server.ts"]
