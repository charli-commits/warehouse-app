FROM node:20-alpine

RUN apk add --no-cache openssl python3 make g++

WORKDIR /app

# Dependencias del servidor
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev --ignore-scripts && npm install --save-dev prisma

# Dependencias del cliente (solo devDeps necesarias para build)
COPY client/package*.json ./client/
RUN cd client && npm ci

# Compilar el cliente
COPY client/ ./client/
RUN cd client && npm run build

# Copiar el servidor
COPY server/ ./server/

# Generar Prisma client con schema de producción (PostgreSQL)
RUN cd server && cp prisma/schema.prod.prisma prisma/schema.prisma && npx prisma generate

EXPOSE 3001

ENV NODE_ENV=production

WORKDIR /app/server

CMD ["sh", "-c", "cp prisma/schema.prod.prisma prisma/schema.prisma && npx prisma migrate deploy && node src/index.js"]
