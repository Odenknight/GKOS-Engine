# syntax=docker/dockerfile:1

FROM node:22.23.2-trixie-slim AS build

WORKDIR /workspace
ARG TARGETARCH=amd64

COPY package.json package-lock.json tsconfig.json tsconfig.declarations.json ./
COPY scripts ./scripts
COPY src ./src

RUN npm ci --ignore-scripts
RUN test "$TARGETARCH" = "amd64" \
    && test "$(node -p 'process.arch')" = "x64" \
    && npm run typecheck \
    && npm run build \
    && node scripts/build-sea.mjs \
    && test -f dist/gkos-agent-x86_64-unknown-linux-gnu

FROM debian:trixie-20260824-slim AS runtime

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates libstdc++6 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 gkos \
    && useradd --uid 10001 --gid 10001 --no-create-home --home-dir /state --shell /usr/sbin/nologin gkos \
    && install -d -o 10001 -g 10001 -m 0700 /state \
    && install -d -o root -g root -m 0555 /vault

COPY --from=build /workspace/dist/gkos-agent-x86_64-unknown-linux-gnu /usr/local/bin/gkos-agent
RUN chmod 0555 /usr/local/bin/gkos-agent

USER 10001:10001
WORKDIR /state
VOLUME ["/state"]

ENTRYPOINT ["/usr/local/bin/gkos-agent"]
CMD ["--notes", "/vault", "--status-file", "/state/desktop-agent.status.json", "--port", "4814"]
