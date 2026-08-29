FROM node:22.22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ENV KUPA_DB=/data/kupa.db PORT=3000
VOLUME /data
EXPOSE 3000
CMD ["npx", "tsx", "src/server/main.ts"]
