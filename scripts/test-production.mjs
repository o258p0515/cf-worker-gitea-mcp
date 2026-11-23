import assert from "node:assert/strict";
import {Script} from "node:vm";
const base = "https://" + process.env.CF_DOMAIN;
const version = process.env.BUILD_VERSION;
const S = (k) => process.env[k] || "";
const tests = [];
async function t(name, fn) {
  try { await fn(); tests.push([name, "PASS"]); console.log("PASS", name); }
  catch (error) { tests.push([name, "FAIL", String(error)]); console.error("FAIL", name, error); }
}
const req = (path, init = {}) => fetch(base + path, { ...init, signal: init.signal || AbortSignal.timeout(15000) });
const post = (path, body, headers = {}) => req(path, {
  method: "POST",
  headers: { "content-type": "application/json", Accept: "application/json, text/event-stream", ...headers },
  body: JSON.stringify(body),
  redirect: "manual"
});
const mcp = (headers, method = "tools/call", params = { name: "get_gitea_mcp_server_version", arguments: {} }) =>
  post("/mcp", { jsonrpc: "2.0", id: 1, method, params }, headers);

await t("T1 health/version/Gitea", async () => {
  const r = await req("/healthz"), j = await r.json();
  assert.equal(r.status, 200); assert.equal(j.version, version); assert.equal(j.giteaReachable, true);
});
await t("T2 unauthenticated API", async () => {
  assert.equal((await req("/api")).status, 200);
  for (const p of ["/api/meta", "/api/samples"]) assert.equal((await req(p)).status, 401);
  assert.equal((await post("/api/execute", {})).status, 401);
});
await t("T3 invalid login", async () => {
  const r = await post("/api/login", { username: "bad", password: "bad" });
  assert.equal(r.status, 401); assert.equal(r.headers.get("set-cookie"), null);
});
let cookie = "";
await t("T4 login/meta/samples/playground JavaScript", async () => {
  const r = await post("/api/login", { username: S("SWAGGER_USERNAME"), password: S("SWAGGER_PASSWORD") });
  assert.equal(r.status, 200); cookie = (r.headers.get("set-cookie") || "").split(";")[0];
  assert.ok(cookie); assert.match(r.headers.get("set-cookie"), /HttpOnly/i); assert.match(r.headers.get("set-cookie"), /Secure/i);
  const h = { Cookie: cookie };
  const page = await req("/api", { headers: h });
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Gitea MCP Playground/);
  assert.match(html, /Playground load failed/);
  const scriptStart = html.indexOf("<script>");
  const scriptEnd = html.indexOf("</script>", scriptStart + 8);
  assert.ok(scriptStart >= 0 && scriptEnd > scriptStart, "authenticated playground script exists");
  const script = html.slice(scriptStart + 8, scriptEnd);
  assert.doesNotThrow(() => new Script(script, {filename: "playground-inline.js"}), "authenticated playground JavaScript must parse");
  assert.ok(script, "authenticated playground script exists");
  const m = await (await req("/api/meta", { headers: h })).json();
  const s = await (await req("/api/samples", { headers: h })).json();
  assert.ok(m.tools.length >= 15); assert.ok(s.me.login && s.owner && s.repo);
});
await t("T5 API execute and Basic auth", async () => {
  for (const name of ["get_gitea_mcp_server_version", "get_me", "search_repos"]) {
    const r = await post("/api/execute", { name, input: {} }, { Cookie: cookie });
    assert.equal(r.status, 200); assert.equal((await r.json()).ok, true);
  }
  const basic = "Basic " + btoa(S("SWAGGER_USERNAME") + ":" + S("SWAGGER_PASSWORD"));
  assert.equal((await req("/api/meta", { headers: { Authorization: basic } })).status, 200);
});
await t("T6 logout", async () => {
  const r = await post("/api/logout", {}, { Cookie: cookie });
  assert.match(r.headers.get("set-cookie") || "", /Max-Age=0/);
});
await t("T7 missing MCP auth", async () => {
  const r = await mcp({});
  assert.equal(r.status, 401); assert.match(r.headers.get("www-authenticate") || "", /oauth-protected-resource/);
});
await t("T8 static bearer MCP", async () => {
  for (const [method, params] of [
    ["initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } }],
    ["tools/list", {}],
    ["tools/call", { name: "get_me", arguments: {} }]
  ]) assert.equal((await mcp({ Authorization: "Bearer " + S("MCP_TOKEN") }, method, params)).status, 200);
});
await t("T9 API key and query token", async () => {
  assert.equal((await mcp({ "X-API-Key": S("MCP_TOKEN") })).status, 200);
  const r = await req("/mcp?token=" + encodeURIComponent(S("MCP_TOKEN")), {
    method: "POST",
    headers: { "content-type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_gitea_mcp_server_version", arguments: {} } })
  });
  assert.equal(r.status, 200);
});
await t("T10 Gitea passthrough", async () => {
  assert.equal((await mcp({ Authorization: "token " + S("GITEA_ACCESS_TOKEN") }, "tools/call", { name: "get_me", arguments: {} })).status, 200);
});
await t("T11 OAuth discovery/DCR", async () => {
  for (const p of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-authorization-server"]) assert.equal((await req(p)).status, 200);
  const r = await post("/oauth/register", { redirect_uris: ["https://claude.ai/api/mcp/auth_callback", "http://localhost:54321/cb", "custom-agent://callback"] });
  assert.equal(r.status, 201);
});
await t("T12 client credentials", async () => {
  const r = await post("/oauth/token", { grant_type: "client_credentials", client_id: S("MCP_OAUTH_CLIENT_ID"), client_secret: S("MCP_OAUTH_CLIENT_SECRET") });
  assert.equal(r.status, 200); const j = await r.json();
  assert.equal((await mcp({ Authorization: "Bearer " + j.access_token }, "tools/call", { name: "get_me", arguments: {} })).status, 200);
});
await t("T13 authorization code PKCE via browser approval form", async () => {
  const verifier = "test-verifier-012345678901234567890123456789012345678901";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/=/g, "").split("+").join("-").split("/").join("_");
  const redirect = "https://any-random-agent.example/cb";
  const params = new URLSearchParams({
    response_type: "code",
    client_id: S("MCP_OAUTH_CLIENT_ID"),
    redirect_uri: redirect,
    state: "state-from-client",
    code_challenge: challenge,
    code_challenge_method: "S256"
  });
  const approvalPage = await req("/oauth/authorize?" + params.toString());
  assert.equal(approvalPage.status, 200);
  const html = await approvalPage.text();
  for (const field of ["redirect_uri", "client_id", "state", "code_challenge", "code_challenge_method"]) {
    assert.match(html, new RegExp('name="' + field + '"'));
  }
  const form = new URLSearchParams({
    redirect_uri: redirect,
    client_id: S("MCP_OAUTH_CLIENT_ID"),
    response_type: "code",
    state: "state-from-client",
    code_challenge: challenge,
    code_challenge_method: "S256",
    passphrase: S("MCP_API_PASSPHRASE"),
    approve: "1"
  });
  const approved = await req("/oauth/authorize", {
    method: "POST",
    headers: {"content-type": "application/x-www-form-urlencoded"},
    body: form.toString(),
    redirect: "manual"
  });
  assert.equal(approved.status, 302);
  const callback = new URL(approved.headers.get("location"));
  assert.equal(callback.searchParams.get("state"), "state-from-client");
  const code = callback.searchParams.get("code");
  assert.ok(code);
  const tokenResponse = await post("/oauth/token", {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirect,
    code_verifier: verifier
  });
  assert.equal(tokenResponse.status, 200);
  const token = await tokenResponse.json();
  assert.equal((await mcp({Authorization: "Bearer " + token.access_token}, "tools/call", {
    name: "get_me", arguments: {}
  })).status, 200);
  const custom = await post("/oauth/authorize", {
    redirect_uri: "cursor://oauth/callback",
    client_id: S("MCP_OAUTH_CLIENT_ID"),
    passphrase: S("MCP_API_PASSPHRASE"),
    approve: true
  });
  assert.equal(custom.status, 302);
  assert.ok((custom.headers.get("location") || "").startsWith("cursor://oauth/callback"));
});
if (tests.some((x) => x[1] === "FAIL")) process.exit(1);
console.log("ALL 13 PRODUCTION TESTS PASSED");