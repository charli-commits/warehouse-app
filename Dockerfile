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

# Generar Prisma client
RUN cd server && npx prisma generate

EXPOSE 3001

ENV NODE_ENV=production

WORKDIR /app/server

# Migrar BD y arrancar
CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
