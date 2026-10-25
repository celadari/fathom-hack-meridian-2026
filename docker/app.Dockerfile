# Fathom app: Vite build served by unprivileged nginx (port 8080), proxying /demo to the demo server.
FROM node:24.8.0-slim AS build
WORKDIR /app
COPY app/package.json app/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY app/ ./
# Same-origin demo API through nginx unless overridden.
ARG VITE_DEMO_API=/demo
ENV VITE_DEMO_API=$VITE_DEMO_API
RUN npx vite build --mode production

FROM nginxinc/nginx-unprivileged:1.31.7-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/nginx-health || exit 1
