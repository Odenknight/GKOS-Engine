# GKOS Local Service 1.0.0 draft.1

This integration-only contract defines the transport-neutral, authenticated
local service boundary used by the Kosmos-Oden standalone viewer and named MCP
agents. It does not activate identity administration, proposal ingress, MCP,
or any Navigation Effects write authority.

All serialized graph, note, episode, result, and traversal-event data must be
derived from the same credential-bound authorized view. The service binds to
loopback by default, accepts bearer credentials only in the Authorization
header, and never accepts a token in a URL.

Traversal events use authenticated fetch streaming with SSE framing. A valid
`Last-Event-ID` acknowledges one sequence and requests retained events strictly
after it. Event persistence remains disabled by default.
