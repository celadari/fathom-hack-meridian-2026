# Fathom demo server (testnet by default): admin/bot/attacker actions for the app's ?demo controls,
# plus the auction loop. Keys come from FATHOM_KEY_* (env or Secret Manager); state on /data.
FROM node:24.8.0-slim
WORKDIR /app/scripts
COPY --chown=node:node scripts/package.json scripts/package-lock.json ./
RUN npm ci --no-audit --no-fund && mkdir -p /data && chown node:node /data
COPY --chown=node:node scripts/ ./
COPY --chown=node:node deployments/ /app/deployments/
ENV HOST=0.0.0.0 \
    PORT=8787 \
    DEMO_LOOP=1 \
    FATHOM_KEYS_FROM_ENV_ONLY=1 \
    FATHOM_STATE_DIR=/data \
    NODE_ENV=production
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "const h=process.env.HOST==='0.0.0.0'?'127.0.0.1':process.env.HOST;fetch('http://'+h+':'+(process.env.PORT||8787)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npx", "tsx", "demo-server.ts"]
