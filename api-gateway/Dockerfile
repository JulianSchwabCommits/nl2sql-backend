FROM nginx:1.27-alpine

RUN addgroup -S app && adduser -S app -G app \
 && chown -R app:app /var/cache/nginx /var/log/nginx /etc/nginx/conf.d \
 && touch /var/run/nginx.pid && chown app:app /var/run/nginx.pid

COPY nginx.conf /etc/nginx/nginx.conf
COPY proxy_common.conf /etc/nginx/proxy_common.conf

USER app
EXPOSE 80