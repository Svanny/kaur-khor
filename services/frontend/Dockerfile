FROM ghcr.io/cirruslabs/flutter:3.41.0 AS builder

WORKDIR /app

COPY pubspec.yaml pubspec.lock ./
RUN flutter config --enable-web && flutter pub get

COPY .metadata ./
COPY analysis_options.yaml ./
COPY icons ./icons
COPY lib ./lib
COPY web ./web

RUN flutter build web --release --base-href=/

FROM node:20-alpine

RUN npm install --global serve@14.2.4

WORKDIR /app
COPY --from=builder /app/build/web ./build/web

ENV PORT=8080

CMD ["sh", "-c", "serve -s build/web -l tcp://0.0.0.0:${PORT:-8080}"]
