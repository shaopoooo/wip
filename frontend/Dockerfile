# ---------------------------------------------
# 1) Builder & Dev Stage
# ---------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# 先複製 package*.json 以利用 Docker 快取機制
COPY package*.json ./
RUN npm install --legacy-peer-deps

# 複製其餘原始碼
COPY . .

# ---------------------------------------------
# 2) Dev Stage (用於 docker-compose.override.yml)
# ---------------------------------------------
FROM builder AS dev
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ---------------------------------------------
# 3) Build Stage (用於正式環境編譯產出)
# ---------------------------------------------
FROM builder AS build
RUN npm run build

# ---------------------------------------------
# 4) Prod Stage (供 Nginx 使用的輕量化映像檔)
# ---------------------------------------------
FROM nginx:1.27-alpine AS prod
# 把編譯好的靜態檔案複製到 Nginx 的預設託管目錄
COPY --from=build /app/dist /usr/share/nginx/html
# 客製化 nginx.conf 由 docker-compose.prod.yml 透過 volume 覆蓋，
# 或是直接從外面 COPY（視配置方式而定，此處保留透過 volume mount 也可以）
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
