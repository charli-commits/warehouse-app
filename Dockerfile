FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

# Instalar dependencias del servidor
COPY server/package*.json ./server/
RUN cd server && npm install --production=false

# Instalar dependencias del cliente
COPY client/package*.json ./client/
RUN cd client && npm install --production=false

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

# Usar schema prod, migrar BD y arrancar
CMD ["sh", "-c", "cp prisma/schema.prod.prisma prisma/schema.prisma && npx prisma migrate deploy && node src/index.js"]
