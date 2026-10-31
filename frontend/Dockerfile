# Production image: Next.js standalone server on port 3000.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# NEXT_PUBLIC_* values are baked in at build time, so pass the real API URL as a build arg
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# "live" calls the Laravel API, anything else uses the built-in mock data
ARG NEXT_PUBLIC_GILGYEOL_API=mock
ENV NEXT_PUBLIC_GILGYEOL_API=$NEXT_PUBLIC_GILGYEOL_API
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
