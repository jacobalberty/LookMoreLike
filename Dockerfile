# syntax=docker/dockerfile:1

# --- build the UI ---
# The build stage runs on the builder's own platform: the built files do not
# depend on the target architecture, so a multi-arch image builds the UI once.
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
# @jacobalberty/beenfar-api comes from GitHub Packages, which wants a token
# with read:packages: docker build --secret id=node_auth_token,env=NODE_AUTH_TOKEN .
RUN --mount=type=secret,id=node_auth_token,env=NODE_AUTH_TOKEN npm ci
COPY . .
RUN npm run build

# The built files, as a stage of their own so that a prebuilt dist/ can stand
# in for it: docker build --build-context built-ui=./dist --target runtime .
FROM scratch AS built-ui
COPY --from=build /app/dist /

# --- serve it ---
FROM nginxinc/nginx-unprivileged:1.30-alpine AS runtime
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/security-headers.conf /etc/nginx/lml-security-headers.conf
COPY --chmod=755 docker/40-lml-config.sh /docker-entrypoint.d/40-lml-config.sh
COPY --from=built-ui / /usr/share/nginx/html/
ENV LOOKMORELIKE_API_BASE=/
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8080/_health || exit 1
