FROM node:20-alpine

WORKDIR /app

# Instalar dependencias del servidor
COPY server/package*.json ./server/
RUN cd server && npm install --production=false

# Instalar dependencias del cliente
COPY client/package*.json ./client/
RUN cd client && npm install --production=false

# Copiar y compilar el cliente
COPY client/ ./client/
RUN cd client && npm run build

# Copiar el servidor y el schema de Prisma
COPY server/ ./server/
RUN cd server && npx prisma generate

# Copiar el package.json raíz (para scripts)
COPY package.json ./

EXPOSE 3001

ENV NODE_ENV=production

# Migrar BD y arrancar
CMD cd server && npx prisma migrate deploy && node src/index.js
