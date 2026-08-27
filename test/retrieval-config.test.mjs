import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { inspect } from "node:util";

import {
  createVectorProvider,
  configuredProviderIdentityFromTrustedConfig,
  discoverTrustedGkosConfig,
  parseGkosToml,
  retrievalCanonicalDigest,
  selectConfiguredProviders,
  stableJson,
} from "../dist/retrieval.mjs";

const CONFIG_SCHEMA = new URL("../contracts/retrieval/gkos-retrieval-1.0.0-draft.1/gkos-config.schema.json", import.meta.url);
const TOML_LEXICAL_FIXTURE = new URL("../contracts/retrieval/gkos-retrieval-1.0.0-draft.1/gkos-toml-lexical-fixture.json", import.meta.url);

const configText = (provider = "openai_compatible") => `config_version = 1

[vectors]
enabled = true
provider = "${provider}"
provider_id = "operator-chosen-provider"
model_id = "operator/chosen-model"
dimensions = 2
timeout_ms = 100
${provider === "openai_compatible" ? 'endpoint = "https://arbitrary.operator.example/v1/embeddings"\ntoken_env = "FIXTURE_PROVIDER_TOKEN"' : provider === "local_onnx" ? 'model_path = "D:/models/arbitrary.onnx"' : 'server = "operator-mcp"\ntool = "embed-anything"'}
`;

test("trusted configuration discovery follows explicit, opted-in CWD, workspace, then user order", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-config-order-"));
  const cwd = join(root, "cwd"), workspace = join(root, "workspace"), user = join(root, "user.toml"), explicit = join(root, "explicit.toml");
  await Promise.all([mkdir(cwd), mkdir(workspace)]);
  await Promise.all([
    writeFile(join(cwd, "gkos.toml"), configText(), "utf8"),
    writeFile(join(workspace, "gkos.toml"), configText("local_onnx"), "utf8"),
    writeFile(user, configText("mcp"), "utf8"),
    writeFile(explicit, configText(), "utf8"),
  ]);
  assert.equal((await discoverTrustedGkosConfig({ explicit_config: explicit, trust_cwd: true, cwd, workspace_root: workspace, user_config_path: user })).provenance, "explicit");
  assert.equal((await discoverTrustedGkosConfig({ trust_cwd: true, cwd, workspace_root: workspace, user_config_path: user })).provenance, "trusted_cwd");
  assert.equal((await discoverTrustedGkosConfig({ trust_cwd: false, cwd, workspace_root: workspace, user_config_path: user })).provenance, "workspace_root");
  assert.equal((await discoverTrustedGkosConfig({ trust_cwd: false, cwd, workspace_root: join(root, "missing"), user_config_path: user })).provenance, "user");
});

test("untrusted vault config cannot shadow provider routes or credentials", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-config-vault-"));
  const user = join(root, "user.toml"), vault = join(root, "vault");
  await mkdir(vault);
  await writeFile(user, configText(), "utf8");
  await writeFile(join(vault, "gkos.toml"), configText("mcp"), "utf8");
  await assert.rejects(discoverTrustedGkosConfig({ cwd: root, workspace_root: join(root, "none"), user_config_path: user, vault_root: vault }), /UNTRUSTED_VAULT_CONFIG_SHADOWING/);
  await writeFile(join(vault, "gkos.toml"), "config_version = 1\n[retrieval]\nmmr = true\nparent_expansion_max_child_tokens = 64\n", "utf8");
  assert.equal((await discoverTrustedGkosConfig({ cwd: root, workspace_root: join(root, "none"), user_config_path: user, vault_root: vault })).provenance, "user");
});

test("automatic Git workspace discovery never promotes config at or below an untrusted vault root", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-config-git-vault-"));
  const vault = join(root, "vault"), nested = join(vault, "nested-repository"), external = join(root, "operator-workspace");
  const user = join(root, "user.toml");
  await Promise.all([
    mkdir(join(vault, ".git"), { recursive: true }),
    mkdir(join(nested, ".git"), { recursive: true }),
    mkdir(join(external, ".git"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(user, configText("local_onnx"), "utf8"),
    writeFile(join(vault, "gkos.toml"), configText("mcp"), "utf8"),
    writeFile(join(nested, "gkos.toml"), configText("mcp"), "utf8"),
    writeFile(join(external, "gkos.toml"), configText("mcp"), "utf8"),
  ]);

  await assert.rejects(
    discoverTrustedGkosConfig({ cwd: vault, trust_cwd: false, vault_root: vault, user_config_path: user }),
    /UNTRUSTED_VAULT_CONFIG_SHADOWING/,
    "an equal-root Git vault remains untrusted",
  );
  await writeFile(join(vault, "gkos.toml"), "config_version = 1\n[retrieval]\nmmr = true\n", "utf8");
  assert.equal(
    (await discoverTrustedGkosConfig({ cwd: nested, trust_cwd: false, vault_root: vault, user_config_path: user })).provenance,
    "user",
    "a nested automatically discovered Git repository cannot redirect provider selection",
  );
  assert.equal(
    (await discoverTrustedGkosConfig({ cwd: nested, trust_cwd: false, workspace_root: nested, vault_root: vault, user_config_path: user })).provenance,
    "workspace_root",
    "an explicitly operator-designated workspace root remains trusted",
  );
  assert.equal(
    (await discoverTrustedGkosConfig({ cwd: external, trust_cwd: false, vault_root: vault, user_config_path: user })).provenance,
    "workspace_root",
    "an automatically discovered workspace outside the vault remains trusted",
  );
});

test("literal secrets, unknown keys, duplicate keys, and unsupported versions are rejected", () => {
  assert.throws(() => parseGkosToml("config_version = 1\nconfig_version = 1\n"), /DUPLICATE/);
  assert.throws(() => parseGkosToml("config_version = 2\n"), /VERSION/);
  assert.throws(() => parseGkosToml("config_version = 1\n[vectors]\ntoken = \"secret\"\n"), /KEY_UNKNOWN/);
  assert.throws(() => parseGkosToml("config_version = 1\n[retrieval]\nrrf_typo = 60\n"), /KEY_UNKNOWN/);
});

test("the strict parser and published config schema agree on sections and provider families", async () => {
  const schema = JSON.parse(await readFile(CONFIG_SCHEMA, "utf8"));
  assert.deepEqual(Object.keys(schema.properties).sort(), ["agents", "config_version", "graph", "reranker", "retrieval", "service", "vectors", "watcher"]);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties.retrieval.properties.parent_expansion_max_child_tokens, { type: "integer", minimum: 1, maximum: 4096 });
  const definitionByProvider = {
    openai_compatible: "openAiVectorProvider",
    local_onnx: "localOnnxVectorProvider",
    mcp: "mcpVectorProvider",
  };
  for (const provider of Object.keys(definitionByProvider)) {
    const parsed = parseGkosToml(configText(provider));
    const logical = { ...parsed[""], ...Object.fromEntries(Object.entries(parsed).filter(([section]) => section)) };
    assert.deepEqual(Object.keys(logical).sort(), ["config_version", "vectors"]);
    const definition = schema.$defs[definitionByProvider[provider]];
    assert.equal(definition.additionalProperties, false);
    for (const key of definition.required) assert.ok(Object.hasOwn(logical.vectors, key), `${provider}.${key}`);
    for (const key of Object.keys(logical.vectors)) assert.ok(Object.hasOwn(definition.properties, key), `${provider}.${key}`);
    assert.equal(definition.properties.provider.const, provider);
  }
  assert.throws(() => parseGkosToml(`${configText("openai_compatible")}model_path = "wrong-family.onnx"\n`), /PROVIDER_KEY_INVALID/);
  assert.throws(() => parseGkosToml("config_version = 1\n[vectors]\nenabled = false\nprovider = \"mcp\"\n"), /PROVIDER_DISABLED_KEY_INVALID/);
  assert.throws(() => parseGkosToml("config_version = 1\n[vectors]\nenabled = true\nprovider = \"mcp\"\nprovider_id = \"p\"\nmodel_id = \"m\"\ndimensions = 2\nserver = \"s\"\n"), /vectors.tool/);
  assert.throws(() => parseGkosToml("config_version = 1\n[retrieval]\nparent_expansion_max_child_tokens = 0\n"), /parent_expansion_max_child_tokens/);
  const withEndpoint = (endpoint) => configText().replace("https://arbitrary.operator.example/v1/embeddings", endpoint);
  for (const endpoint of [
    "HTTPS://operator.example/v1/embeddings", "ftp://operator.example/model", "/relative/model",
    "http://", "https:///missing-host", "https://operator.example path", "https://operator.example\\\\redirect",
    "https://user:password@operator.example/v1/embeddings",
  ]) {
    assert.throws(() => parseGkosToml(withEndpoint(endpoint)), /vectors.endpoint/, endpoint);
  }
  assert.throws(() => createVectorProvider({
    kind: "openai_compatible", configuration_provenance: "trusted_operator", provider_id: "p", model_id: "m",
    dimensions: 2, endpoint: "HTTPS://operator.example/v1/embeddings",
  }, { fetch: async () => new Response() }), /lowercase http/);
  assert.throws(() => createVectorProvider({
    kind: "openai_compatible", configuration_provenance: "trusted_operator", provider_id: "p", model_id: "m",
    dimensions: 2, endpoint: "https://user:password@operator.example/v1/embeddings",
  }, { fetch: async () => new Response() }), /embedded credentials/);
});

test("TOML subset handles comments after even backslashes and quoted array punctuation", () => {
  const parsed = parseGkosToml(`config_version = 1
[retrieval]
mode = "ends-with-backslash\\\\" # an even backslash run does not escape the quote
path_include = ["it's", 'literal#hash'] # hashes inside quotes are data
`);
  assert.equal(parsed.retrieval.mode, "ends-with-backslash\\");
  assert.deepEqual(parsed.retrieval.path_include, ["it's", "literal#hash"]);
});

test("trusted TOML lexical subset matches the cross-language accept/reject and digest fixture", async () => {
  const fixture = JSON.parse(await readFile(TOML_LEXICAL_FIXTURE, "utf8"));
  for (const item of fixture.accepted) {
    const document = parseGkosToml(item.text);
    assert.equal(stableJson(document), item.canonical_document, item.id);
    assert.equal(retrievalCanonicalDigest(document), item.configuration_digest, item.id);
  }
  for (const item of fixture.rejected) {
    assert.throws(() => parseGkosToml(item.text), (error) => error.message.includes(item.error_code), item.id);
  }
});

test("an explicitly named missing config is a hard error", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-config-missing-"));
  await assert.rejects(discoverTrustedGkosConfig({ explicit_config: join(root, "missing.toml"), cwd: root, workspace_root: join(root, "none"), user_config_path: join(root, "user.toml") }), /EXPLICIT_GKOS_CONFIG_NOT_FOUND/);
});

test("all three provider families are selected only by trusted config with no preference", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-config-providers-"));
  const previous = process.env.FIXTURE_PROVIDER_TOKEN;
  process.env.FIXTURE_PROVIDER_TOKEN = "test-only-token";
  try {
    for (const provider of ["openai_compatible", "local_onnx", "mcp"]) {
      const path = join(root, `${provider}.toml`);
      await writeFile(path, configText(provider), "utf8");
      const config = await discoverTrustedGkosConfig({ explicit_config: path, cwd: root, workspace_root: join(root, "none"), user_config_path: join(root, "none.toml") });
      const selected = selectConfiguredProviders(config, {
        fetch: async () => new Response(JSON.stringify({ model: "operator/chosen-model", data: [{ index: 0, embedding: [1, 0] }] }), { status: 200 }),
        local_embedding_executor: async ({ request_id, model_id, dimensions, texts }) => ({ request_id, model_id, dimensions, vectors: texts.map(() => [1, 0]) }),
        mcp_tool_caller: async ({ request_id }) => ({ request_id, model_id: "operator/chosen-model", dimensions: 2, vectors: [[1, 0]] }),
      });
      assert.equal(selected.vector.kind, provider);
    }
  } finally {
    if (previous === undefined) delete process.env.FIXTURE_PROVIDER_TOKEN;
    else process.env.FIXTURE_PROVIDER_TOKEN = previous;
  }
});

test("configured token environment is mandatory when named and optional when omitted", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-config-token-env-"));
  const path = join(root, "gkos.toml");
  await writeFile(path, configText(), "utf8");
  const config = await discoverTrustedGkosConfig({ explicit_config: path, cwd: root, workspace_root: join(root, "none"), user_config_path: join(root, "none.toml") });
  const previous = process.env.FIXTURE_PROVIDER_TOKEN;
  try {
    delete process.env.FIXTURE_PROVIDER_TOKEN;
    assert.throws(() => selectConfiguredProviders(config, { fetch: async () => new Response() }), /GKOS_CONFIG_SECRET_UNAVAILABLE:vectors.token_env/);
    process.env.FIXTURE_PROVIDER_TOKEN = "";
    assert.throws(() => selectConfiguredProviders(config, { fetch: async () => new Response() }), /GKOS_CONFIG_SECRET_UNAVAILABLE:vectors.token_env/);
    const openConfig = { ...config, document: parseGkosToml(configText().replace('\ntoken_env = "FIXTURE_PROVIDER_TOKEN"', "")) };
    assert.equal(selectConfiguredProviders(openConfig, { fetch: async () => new Response() }).vector.kind, "openai_compatible");
  } finally {
    if (previous === undefined) delete process.env.FIXTURE_PROVIDER_TOKEN;
    else process.env.FIXTURE_PROVIDER_TOKEN = previous;
  }
});

test("resolved provider credentials are private across inspection, serialization, and errors", async () => {
  const sentinel = "SENTINEL_PROVIDER_SECRET_7f29";
  const variable = "GKOS_PRIVATE_PROVIDER_TOKEN";
  const previous = process.env[variable];
  const root = await mkdtemp(join(tmpdir(), "gkos-config-private-token-"));
  const path = join(root, "gkos.toml");
  await writeFile(path, `config_version = 1
[vectors]
enabled = true
provider = "openai_compatible"
provider_id = "operator-vector"
model_id = "operator-vector-model"
dimensions = 2
endpoint = "https://arbitrary.operator.example/embed"
token_env = "${variable}"
[reranker]
enabled = true
provider = "openai_compatible"
provider_id = "operator-reranker"
model_id = "operator-reranker-model"
endpoint = "https://arbitrary.operator.example/rerank"
token_env = "${variable}"
`, "utf8");
  process.env[variable] = sentinel;
  try {
    const config = await discoverTrustedGkosConfig({ explicit_config: path, cwd: root, workspace_root: join(root, "none"), user_config_path: join(root, "none.toml") });
    const selected = selectConfiguredProviders(config, { fetch: async () => new Response("unavailable", { status: 503 }) });
    const retrievalPublic = await import("../dist/retrieval.mjs");
    assert.equal(Object.hasOwn(retrievalPublic, "providerConfigFromTrustedConfig"), false);
    const identities = {
      vector: configuredProviderIdentityFromTrustedConfig(config, "vectors"),
      reranker: configuredProviderIdentityFromTrustedConfig(config, "reranker"),
    };
    const renderedProviders = [
      inspect(retrievalPublic, { depth: 2 }),
      inspect(identities, { depth: 10 }),
      JSON.stringify(identities),
      inspect(selected, { depth: 10 }),
      JSON.stringify(selected),
      String(selected.vector),
      String(selected.reranker),
    ].join("\n");
    assert.equal(renderedProviders.includes(sentinel), false);

    const errors = [];
    await assert.rejects(selected.vector.embed(["content"]), (error) => { errors.push(error); return /HTTP_503/.test(String(error)); });
    await assert.rejects(selected.reranker.rerank("query", [{ chunk_id: "chunk", text: "content" }]), (error) => { errors.push(error); return /HTTP_503/.test(String(error)); });
    const renderedErrors = errors.flatMap((error) => [inspect(error, { depth: 10 }), JSON.stringify(error), String(error), error.stack ?? ""]).join("\n");
    assert.equal(renderedErrors.includes(sentinel), false);
  } finally {
    if (previous === undefined) delete process.env[variable];
    else process.env[variable] = previous;
  }
});

test("local timeout aborts the executor signal", async () => {
  let aborted = false;
  const provider = createVectorProvider({
    kind: "local_onnx", configuration_provenance: "trusted_operator", provider_id: "p", model_id: "m",
    dimensions: 2, model_path: "model.onnx", timeout_ms: 10,
  }, {
    local_embedding_executor: ({ signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); }, { once: true })),
  });
  await assert.rejects(provider.embed(["x"]), /TIMEOUT|aborted/);
  assert.equal(aborted, true);
});

test("MCP timeout aborts the upstream tool signal", async () => {
  let aborted = false;
  const provider = createVectorProvider({
    kind: "mcp", configuration_provenance: "trusted_operator", provider_id: "p", model_id: "m", dimensions: 2,
    server: "operator-server", embedding_tool: "operator-embed", timeout_ms: 10,
  }, {
    mcp_tool_caller: ({ signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); }, { once: true })),
  });
  await assert.rejects(provider.embed(["x"]), /TIMEOUT|aborted/);
  assert.equal(aborted, true);
});
