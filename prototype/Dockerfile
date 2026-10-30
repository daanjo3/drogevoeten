# syntax=docker/dockerfile:1
# Droge Voeten v3. Presentation layer (app/, incl. ar.html) + prepared data layer output, served as static files.
# Rebuilding the data layer is a separate step (see README); this image only serves its result.
FROM nginx:1.27-alpine

COPY <<'CONF' /etc/nginx/conf.d/default.conf
server {
    listen 80;
    root /usr/share/nginx/html;
    # Redirects carry only the path (/app/); the gateway adds its path prefix.
    absolute_redirect off;
    gzip on;
    gzip_types application/json application/ld+json text/turtle application/n-triples text/csv application/javascript text/css text/plain;

    location = / { return 302 /app/; }
    location ~* \.jsonld$ { types { } default_type application/ld+json; }
    location ~* \.ttl$    { types { } default_type text/turtle; }
    location ~* \.nt$     { types { } default_type application/n-triples; }
    location ~* \.qs$     { types { } default_type "text/plain; charset=utf-8"; }
    location / { try_files $uri $uri/ =404; }
}
CONF

COPY app/ /usr/share/nginx/html/app/
COPY data/build/ /usr/share/nginx/html/data/build/
