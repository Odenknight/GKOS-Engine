# GKOS-Engine implementation guide

**Reference implementation:** `gkos-engine` 2.0.1, commit
`7c742436d50b34f6dda66976212a672fb51f7c21`.

GKOS-Engine implements the GKX 2.0 machine contract. Records use
`gkx_version: "2.0"`; sidecars are under `.gkx/`; diagnostics have `GKX-*`
codes; and the command is `gkx`.

```sh
gkx validate ./corpus
gkx assess ./corpus
gkx graph ./corpus -o graph.json
gkx export graphiti ./corpus --episodes episodes.json
```

The engine remains deterministic and proposal-only integrations require a
separate authorized workflow before they affect governed state.
