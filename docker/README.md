# Debian read-only container profile

This internal-development profile packages the existing Linux x64 `gkos-agent` sidecar. It preserves the service's loopback-only default and gives the corpus no write path. It does not enable proposal ingress, Navigation Effects, or any other source-writing capability.

Build from the repository root:

```bash
docker build -f docker/Dockerfile -t gkos-agent:dev .
```

Prepare the host state directory for the fixed container identity. Keep it private because it contains the generated viewer token and status document:

```bash
sudo install -d -o 10001 -g 10001 -m 0700 /srv/gkos-state
```

On Debian Linux, run with host networking so the process's `127.0.0.1` listener remains the host's loopback listener:

```bash
docker run --rm \
  --network host \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  --mount type=bind,src=/srv/gkos-vault,dst=/vault,readonly \
  --mount type=bind,src=/srv/gkos-state,dst=/state \
  gkos-agent:dev \
  --notes /vault \
  --status-file /state/desktop-agent.status.json \
  --port 4814
```

There is deliberately no published container port, proxy, or additional listener. This host-network command is Linux-specific. Do not replace it with a bridged or externally reachable listener; use an SSH loopback tunnel for remote operation.

The status document is `/state/desktop-agent.status.json`; the sibling token file is `/state/desktop-agent.token`. The token is never supplied as a command argument. The host bind mount must remain owned by UID/GID `10001:10001` with mode `0700`. The image creates `/state` with those permissions, but a bind mount replaces the image directory and therefore needs matching host permissions.

The JSON entrypoint runs the sidecar as PID 1, so Docker sends `SIGTERM` directly to it. The sidecar's existing shutdown handler closes its watcher and HTTP service before exit. `/vault` is mounted read-only and `/state` is the only durable writable mount; the read-only root filesystem and bounded temporary filesystem make accidental writes elsewhere fail.

This profile is an internal alpha until it has been built and smoke-tested on Debian 13 and its artifact is included by an authorized release workflow. The current identity/MCP contract protects `.github/workflows/sidecar-release.yml`, so adding a Linux release job requires a separately reviewed contract update.
