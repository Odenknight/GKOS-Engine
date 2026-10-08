# GKOS Intelligence Sidecar

This optional Python service uses DSPy to produce **non-authoritative
proposals** for GKOS. It is not imported by the TypeScript engine, is not
needed for deterministic/offline operation, and cannot write notes.

The service implements the `gkos.intelligence.v1` JSON contract:

- `GET /health` reports `ready` only when DSPy and `DSPY_MODEL` are configured;
  otherwise it reports `needs_configuration` rather than a misleading success.
- `POST /v1/proposals` accepts a contract request and returns candidate
  proposals.

Install this component only when AI assistance is wanted:

```bash
python -m venv .venv
.venv/Scripts/pip install -e .
set DSPY_MODEL=openai/gpt-5-mini
gkos-intelligence --host 127.0.0.1 --port 8765
```

Provider credentials are configured according to the selected DSPy model.
The server binds to loopback by default. Set `GKOS_INTELLIGENCE_TOKEN` to
require `Authorization: Bearer …` on proposal requests.

Every returned object remains a suggestion. The TypeScript engine must
validate the envelope and each proposal before a product displays it. An
authorized workflow—not this service—decides whether to author or approve a
change.
