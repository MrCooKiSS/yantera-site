# Базовый образ Nginx
FROM nginx:stable-alpine

# Копируем файлы проекта в директорию Nginx
COPY ./ /usr/share/nginx/html

COPY nginx.conf /etc/nginx/conf.d/default.conf

# Открываем порт
EXPOSE 8081

CMD ["nginx", "-g", "daemon off;"]

