# ---- Etapa 1: build del bundle de Vite ----
FROM node:20-alpine AS builder

WORKDIR /app

# Dependencias (incluye devDependencies: vite, typescript, etc.)
COPY package*.json ./
RUN npm ci

# Código fuente
COPY . .

# URL de la API: relativa (mismo origen) porque el nginx de este contenedor
# hace de proxy de /api al backend. Vite la incrusta en build time.
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ---- Etapa 2: servir estáticos con Nginx ----
FROM nginx:alpine

# Configuración SPA + proxy /api al backend
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Bundle compilado
COPY --from=builder /app/dist /usr/share/nginx/html

# Puerto interno (no se publica: lo alcanza Nginx Proxy Manager por la red compartida)
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
