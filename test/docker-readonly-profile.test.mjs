import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Dockerfile builds a source-free Debian 13 runtime as a fixed unprivileged identity", async () => {
  const dockerfile = await read("docker/Dockerfile");

  assert.match(dockerfile, /^FROM node:22\.23\.2-trixie-slim AS build$/m);
  assert.match(dockerfile, /^FROM debian:trixie-20260824-slim AS runtime$/m);
  assert.match(dockerfile, /npm ci --ignore-scripts/);
  assert.match(dockerfile, /node scripts\/build-sea\.mjs/);
  assert.match(dockerfile, /dist\/gkos-agent-x86_64-unknown-linux-gnu/);
  assert.match(
    dockerfile,
    /^COPY --from=build \/workspace\/dist\/gkos-agent-x86_64-unknown-linux-gnu \/usr\/local\/bin\/gkos-agent$/m,
  );
  assert.match(dockerfile, /install -d .* -m 0700 \/state/);
  assert.match(dockerfile, /install -d .* -m 0555 \/vault/);
  assert.match(dockerfile, /^USER 10001:10001$/m);
  assert.match(dockerfile, /^ENTRYPOINT \["\/usr\/local\/bin\/gkos-agent"\]$/m);
  assert.match(
    dockerfile,
    /^CMD \["--notes", "\/vault", "--status-file", "\/state\/desktop-agent\.status\.json", "--port", "4814"\]$/m,
  );

  const runtime = dockerfile.slice(dockerfile.indexOf("FROM debian:"));
  assert.doesNotMatch(runtime, /^COPY (?!--from=build)/m);
  assert.doesNotMatch(runtime, /node_modules|\/workspace\/src|\/workspace\/scripts/);
});

test("container profile has no listener bypass, proxy, or bridge publishing design", async () => {
  const [dockerfile, guide] = await Promise.all([
    read("docker/Dockerfile"),
    read("docker/README.md"),
  ]);

  for (const forbidden of [
    /0\.0\.0\.0/i,
    /\bsocat\b/i,
    /\bEXPOSE\b/,
    /\bnginx\b/i,
    /\bhaproxy\b/i,
    /--publish(?:=|\s)/i,
    /(?:^|\s)-p(?:=|\s+\d)/m,
    /--host(?:=|\s)/i,
  ]) {
    assert.doesNotMatch(dockerfile, forbidden);
    assert.doesNotMatch(guide, forbidden);
  }

  assert.match(guide, /docker build -f docker\/Dockerfile -t gkos-agent:dev \./);
  assert.match(guide, /--network host/);
  assert.match(guide, /--read-only/);
  assert.match(guide, /dst=\/vault,readonly/);
  assert.match(guide, /dst=\/state/);
  assert.match(guide, /--status-file \/state\/desktop-agent\.status\.json/);
  assert.match(guide, /SIGTERM/);
});

test("exec-form PID 1 has an existing graceful SIGTERM handler", async () => {
  const [dockerfile, sidecar] = await Promise.all([
    read("docker/Dockerfile"),
    read("src/desktop-agent.ts"),
  ]);

  assert.match(dockerfile, /^ENTRYPOINT \["\/usr\/local\/bin\/gkos-agent"\]$/m);
  assert.match(sidecar, /const shutdown = \(\): void => \{ void host\.shutdown\(\)/);
  assert.match(sidecar, /process\.on\("SIGTERM", shutdown\)/);
});

test("Docker build context is an explicit source allowlist", async () => {
  const ignore = await read(".dockerignore");
  const lines = ignore.split(/\r?\n/).filter(Boolean);

  assert.equal(lines[0], "*");
  for (const allowed of [
    "!package.json",
    "!package-lock.json",
    "!tsconfig.json",
    "!tsconfig.declarations.json",
    "!scripts/**",
    "!src/**",
    "!docker/Dockerfile",
  ]) {
    assert.ok(lines.includes(allowed), `${allowed} must be present`);
  }
  for (const unsafe of ["!.git/**", "!node_modules/**", "!dist/**", "!.gkx/**", "!test/**"])
    assert.ok(!lines.includes(unsafe), `${unsafe} must remain excluded`);
});

test("release workflow remains protected by the identity contract", async () => {
  const protectedPaths = await read(
    "contracts/identity/GKOS-AGENT-IDENTITY-MCP-CONTRACT-1.0.0-draft.1/protected-paths.txt",
  );
  assert.match(protectedPaths, /^\.github\/workflows\/sidecar-release\.yml$/m);
});
