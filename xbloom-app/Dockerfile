FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production \
    PORT=8787 \
    PUBLIC_MODE=1

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# OCR language data sits in the working dir, where tesseract.js looks for it.
COPY ara.traineddata eng.traineddata ./
COPY server ./server
COPY public ./public

USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" || exit 1

CMD ["node", "server/index.js"]
