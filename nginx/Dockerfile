FROM nginx:1.27

# Copia la configuración HTTP directamente en la imagen
# Traefik maneja SSL externamente — nginx solo actúa como proxy interno
RUN rm -f /etc/nginx/conf.d/default.conf
COPY conf.d/atlas-http.conf /etc/nginx/conf.d/default.conf
