# RUNSHOES 앱 — React(Vite) 빌드물 + Spring Boot API 한 컨테이너(:3000). docs/SPRING_MIGRATION_PLAN.md Phase 4.
# 데이터는 MySQL(SPRING_DATASOURCE_*), 스키마·시드는 Flyway 가 기동 때 적용한다 — 이미지에 db.json 이 없다.
# 챗봇은 따로(Dockerfile.chatbot, 사이드카). 이미지 이름 · 포트는 Node 때와 같다 — Service · Ingress · Jenkins sed 를 바꾸지 않는다.
#
#   docker build -t runshoes .
#   docker run -p 3000:3000 -e SPRING_DATASOURCE_URL=jdbc:mysql://<host>:3306/runshoes?... -e SPRING_DATASOURCE_PASSWORD=... runshoes
#
# 2026-10-18 전에는 node:20-alpine 에서 server.cjs(Express + json-server, db.json)를 돌렸다 — 되돌릴 때는 그 이미지 태그로.

# ---- 1단계: 프런트 ----
FROM node:20-alpine AS web
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
# 빌드에 쓰는 것만 — 백엔드를 고쳐도 이 단계가 다시 돌지 않게
COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY public ./public
COPY src ./src
ENV NODE_OPTIONS=--max-old-space-size=1536
RUN yarn build

# ---- 2단계: 백엔드 ----
FROM maven:3.9-eclipse-temurin-21 AS server
WORKDIR /build
COPY backend/pom.xml .
RUN mvn -q -B dependency:go-offline
COPY backend/src ./src
# 단위 테스트(DB 없이)까지 돈다. 계약 비교(contract/)는 이미지 밖에서
ENV MAVEN_OPTS=-Xmx768m
RUN mvn -q -B package

# ---- 3단계: 필요한 모듈만 담은 JRE — temurin 21-jre-alpine(287MB)을 그대로 쓰면 이미지가 400MB 를 넘는다 ----
# 모듈이 빠지면 실행 중 NoClassDefFoundError 로 드러난다 — contract/ 전체를 이 이미지로 돌려 확인했다(backend/README.md)
FROM eclipse-temurin:21-jdk-alpine AS jre
RUN jlink --output /jre --strip-debug --no-man-pages --no-header-files --compress=zip-6 \
      --add-modules java.base,java.compiler,java.desktop,java.instrument,java.logging,java.management,java.naming,java.net.http,java.scripting,java.security.jgss,java.sql,java.xml,jdk.charsets,jdk.crypto.ec,jdk.management,jdk.unsupported,jdk.zipfs

# ---- 4단계: 실행 ----
# jdk 이미지와 같은 Alpine(musl) — 바꿀 때는 eclipse-temurin:21-jdk-alpine 의 /etc/alpine-release 와 맞춘다
FROM alpine:3.24
COPY --from=jre /jre /opt/java
ENV PATH=/opt/java/bin:$PATH
WORKDIR /opt/app
RUN addgroup -S -g 10001 runshoes && adduser -S -D -H -u 10001 -G runshoes runshoes
COPY --from=server /build/target/runshoes-0.1.0.jar app.jar
COPY --from=web /app/dist ./static
ENV TZ=UTC APP_STATIC=/opt/app/static SERVER_PORT=3000
# root 로 돌지 않는다 — 쓰는 곳은 /tmp(Tomcat) 뿐. 클러스터에서 runAsNonRoot 를 켤 수 있다(Phase 5.2)
USER 10001
EXPOSE 3000
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=65", "-jar", "app.jar"]
