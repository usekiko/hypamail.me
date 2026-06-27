# Hypamail webmail. Multi-stage; runs as non-root. NEXT_PUBLIC_* are inlined at
# build time from .env in the build context; runtime secrets come from the
# container environment (quadlet EnvironmentFile). .env is never copied into the
# final image.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Git SHA for Next.js skew protection (see next.config.ts deploymentId).
ARG DEPLOYMENT_ID
ENV DEPLOYMENT_ID=$DEPLOYMENT_ID
RUN npm run build

FROM node:24-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
USER node
EXPOSE 3002
ENV PORT=3002
ENV HOSTNAME=127.0.0.1
CMD ["node", "server.js"]
