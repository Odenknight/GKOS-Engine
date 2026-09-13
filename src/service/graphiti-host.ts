import type { LocalServiceOptions } from "./server";
import type { GraphitiBrokerHost } from "../graphiti-broker";
import { buildServiceGraphitiQueryContext } from "./graphiti-manifest";
import { GkosServiceDeniedError } from "./authorized-view";

type HostInput = Parameters<NonNullable<LocalServiceOptions["graphitiHost"]>>[0];
interface HostState {
  /** Host revision covering source, policy, configuration and ledger publication.
   * Never reuse a revision after any covered state changes (including rollback). */
  revision: string;
  corpus_id: string;
  scope_digest: string;
  configuration_digest: string;
}

/** Host integration, with no caller-selected source path, ledger job or endpoint.
 * current must return null when the supplied service snapshot is no longer current.
 * The owner implements revision changes synchronously with authority invalidation. */
export function createServiceGraphitiHost(options: {
  current(input: HostInput): HostState | null;
  /** Bound the read before allocation; refuse files exceeding maxBytes. */
  readSourceBytes(path: string, input: HostInput, maxBytes: number): Promise<Uint8Array | null>;
  readPublication(state: Readonly<HostState>, input: HostInput): Promise<unknown>;
  query: GraphitiBrokerHost["query"];
}): NonNullable<LocalServiceOptions["graphitiHost"]> {
  return async input => {
    try {
      const selected = options.current(input);
      if (!selected || typeof selected.revision !== "string" || !selected.revision || selected.revision.length > 128) return null;
      const state = Object.freeze({ ...selected });
      const valid = () => {
        if (input.signal.aborted) return false;
        const now = options.current(input);
        return !!now && now.revision === state.revision && now.corpus_id === state.corpus_id &&
          now.scope_digest === state.scope_digest && now.configuration_digest === state.configuration_digest;
      };
      if (!valid()) return null;
      const bytes = new Map<string, Uint8Array>();
      let total = 0;
      if (!input.view.notes.length || input.view.notes.length > 50000) return null;
      for (const note of input.view.notes) {
        if (!valid()) return null;
        const raw = await options.readSourceBytes(note.path, input, 64 * 1024 * 1024 - total);
        if (!valid() || !(raw instanceof Uint8Array)) return null;
        total += raw.byteLength;
        if (total > 64 * 1024 * 1024) return null;
        bytes.set(note.path, new Uint8Array(raw));
      }
      const publication = await options.readPublication(state, input);
      if (!valid()) return null;
      const context = await buildServiceGraphitiQueryContext({ identity: input.identity, corpus: input.snapshot,
        authorization: input.authorization, evaluationTime: input.view.evaluated_at, vaultName: input.vaultName }, bytes, state, publication);
      if (!context || !valid()) return null;
      return {
        current: () => {
          if (!valid()) throw new GkosServiceDeniedError();
          // Keep the retained authority map private from consumer mutation.
          return structuredClone(context);
        },
        query: (request, signal) => {
          if (signal.aborted || !valid()) throw new GkosServiceDeniedError();
          return options.query(request, signal);
        },
      };
    } catch { return null; }
  };
}
