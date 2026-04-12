FROM crpi-pqzengdgydwtnauc.cn-shanghai.personal.cr.aliyuncs.com/mjxj-env/node:22 AS builder
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM crpi-pqzengdgydwtnauc.cn-shanghai.personal.cr.aliyuncs.com/mjxj-env/nginx:1.27.4
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
