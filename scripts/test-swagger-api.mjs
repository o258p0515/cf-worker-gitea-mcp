import assert from "node:assert/strict";

const base = "https://" + process.env.CF_DOMAIN;
const username = process.env.SWAGGER_USERNAME || "";
const password = process.env.SWAGGER_PASSWORD || "";
assert.ok(process.env.CF_DOMAIN, "CF_DOMAIN secret is required");
assert.ok(username && password, "SWAGGER_USERNAME and SWAGGER_PASSWORD secrets are required");
const authorization = "Basic " + Buffer.from(username + ":" + password).toString("base64");
const req = (path, init = {}) => fetch(base + path, {
  ...init,
  headers: { Authorization: authorization, Accept: "application/json", ...(init.headers || {}) },
  signal: init.signal || AbortSignal.timeout(30000)
});
const post = (path, body) => req(path, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body)
});

const expected = [
  "get_gitea_mcp_server_version","get_me","get_user_orgs","create_organization","search_users","search_org_teams","search_repos","search_issues",
  "notification_read","notification_write","label_read","label_write","milestone_read","milestone_write","wiki_read","wiki_write",
  "timetracking_read","timetracking_write","package_read","package_write","project_read","project_write","list_issues","issue_read","issue_write",
  "list_pull_requests","pull_request_read","pull_request_write","pull_request_review_write","actions_config_read","actions_config_write",
  "actions_run_read","actions_run_write","repo_read","repo_write","get_repository_tree","get_file_contents","get_dir_contents",
  "create_or_update_file","delete_file","branch_read","branch_write","tag_read","tag_write","commit_read","commit_write","release_read","release_write"
];
const writeNames = [
  "create_organization","notification_write","label_write","milestone_write","wiki_write","timetracking_write","package_write","project_write",
  "issue_write","pull_request_write","pull_request_review_write","actions_config_write","actions_run_write","repo_write","create_or_update_file",
  "delete_file","branch_write","tag_write","commit_write","release_write"
];
const smoke = [
  ["get_gitea_mcp_server_version",{}],["get_me",{}],["get_user_orgs",{page:1,limit:5}],
  ["search_users",{q:"test",limit:5}],["search_org_teams",{org:"code-dh-hospital",q:"",limit:5}],
  ["search_repos",{q:"dh-issue-listener",limit:5}],["search_issues",{q:"3556",limit:5}],
  ["notification_read",{method:"list",limit:5}],["label_read",{method:"list_repo"}],["milestone_read",{method:"list"}],
  ["wiki_read",{method:"list"}],["timetracking_read",{method:"list_user_times",limit:5}],["package_read",{method:"list"}],
  ["project_read",{method:"list_repo",owner:"code-dh-hospital",repo:"dh-issue-listener"}],
  ["list_issues",{state:"all",limit:5}],["issue_read",{method:"get",owner:"hdhiswork",repo:"YEUCAU",index:1039}],
  ["list_pull_requests",{state:"open",limit:5,owner:"code-dh-hospital",repo:"dh-hos-code-only"}],
  ["pull_request_read",{method:"get",index:390,owner:"code-dh-hospital",repo:"dh-hos-code-only"}],
  ["actions_config_read",{method:"list_variables",owner:"code-dh-hospital",repo:"dh-issue-listener"}],
  ["actions_run_read",{method:"list_workflows",owner:"code-dh-hospital",repo:"dh-issue-listener"}],
  ["repo_read",{method:"get",owner:"code-dh-hospital",repo:"dh-issue-listener"}],
  ["get_repository_tree",{sha:"HEAD",owner:"code-dh-hospital",repo:"dh-issue-listener",recursive:true}],
  ["get_file_contents",{filepath:"README.md",ref:"main",owner:"code-dh-hospital",repo:"dh-issue-listener"}],
  ["get_dir_contents",{dirpath:"",ref:"main",owner:"code-dh-hospital",repo:"dh-issue-listener"}],
  ["branch_read",{method:"list",owner:"code-dh-hospital",repo:"dh-issue-listener"}],
  ["tag_read",{method:"list",owner:"code-dh-hospital",repo:"dh-issue-listener"}],
  ["commit_read",{method:"list",owner:"code-dh-hospital",repo:"dh-issue-listener"}],
  ["release_read",{method:"list",owner:"code-dh-hospital",repo:"dh-issue-listener"}]
];

const swagger = await req("/api");
assert.equal(swagger.status, 200, "Swagger /api page should be reachable");
assert.match(await swagger.text(), /Gitea MCP Playground|Gitea MCP Login/, "Swagger UI HTML");
const metaResponse = await req("/api/meta");
assert.equal(metaResponse.status, 200, "Swagger API authentication");
const meta = await metaResponse.json();
assert.equal(meta.tools.length, 48);
assert.equal(meta.filters.totalCount, 48);
assert.equal(meta.filters.activeCount, 48);
assert.deepEqual(meta.tools.map(t => t.name).sort(), [...expected].sort());

const samplesResponse = await req("/api/samples");
assert.equal(samplesResponse.status, 200, "Swagger API samples");
const samples = await samplesResponse.json();
assert.ok(samples.me?.login, "Gitea sample identity should be present");

let passed = 0;
for (const [name, overrides] of smoke) {
  const input = { ...(samples.inputs?.[name] || {}), ...overrides };
  if (!["get_gitea_mcp_server_version","get_me","get_user_orgs","search_users","search_org_teams","search_repos","search_issues","notification_read","timetracking_read","package_read"].includes(name)) {
    if (input.owner === undefined) input.owner = samples.owner;
    if (input.repo === undefined) input.repo = samples.repo;
  }
  if (["search_org_teams","label_read","milestone_read","wiki_read","project_read"].includes(name) && input.org === undefined) input.org = samples.owner || samples.me.login;
  if (["get_repository_tree","get_file_contents","get_dir_contents","repo_read","branch_read","tag_read","commit_read","release_read","project_read","actions_config_read","actions_run_read"].includes(name)) {
    input.owner = "code-dh-hospital";
    input.repo = "dh-issue-listener";
  }
  const response = await post("/api/execute", { name, input, confirmation: false });
  assert.ok(response.status < 500, name + " returned HTTP " + response.status);
  const body = await response.json();
  assert.equal(body.ok, true, name + " Swagger execute failed: " + body.error);
  const result = body.result ?? body.data;
  if (name === "get_repository_tree") assert.ok(Array.isArray(result?.tree) && result.tree.length > 0, "tree payload should contain entries");
  if (name === "get_file_contents") assert.ok(typeof result?.decoded_content === "string" && result.decoded_content.length > 0, "file content should be decoded");
  if (name === "get_dir_contents") assert.ok(Array.isArray(result) && result.length > 0, "directory payload should contain entries");
  passed++;
  console.log("PASS Swagger /api/execute " + name);
}

for (const name of writeNames) {
  const response = await post("/api/execute", { name, input: {}, confirmation: false });
  assert.equal(response.status, 403, name + " must be blocked without explicit confirmation and fixture");
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.match(body.error, /Write tool blocked/);
}
console.log("SWAGGER API ACCEPTANCE PASS: 48/48 tool names visible; " + passed + "/28 read tools executed successfully; " + writeNames.length + "/20 write tools safely blocked without confirmation.");
if (!process.env.GITEA_TEST_OWNER || !process.env.GITEA_TEST_REPO) {
  console.log("WRITE E2E: SKIPPED — GITEA_TEST_OWNER/GITEA_TEST_REPO secrets are not configured. No live repository was mutated.");
}
