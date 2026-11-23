import assert from "node:assert/strict";
const base="https://"+process.env.CF_DOMAIN;
const S=k=>process.env[k]||"";
const req=(path,init={})=>fetch(base+path,{...init,signal:init.signal||AbortSignal.timeout(20000)});
const post=(path,body,headers={})=>req(path,{method:"POST",headers:{"content-type":"application/json",Accept:"application/json, text/event-stream",...headers},body:JSON.stringify(body)});
const expected=["get_gitea_mcp_server_version","get_me","get_user_orgs","create_organization","search_users","search_org_teams","search_repos","search_issues","notification_read","notification_write","label_read","label_write","milestone_read","milestone_write","wiki_read","wiki_write","timetracking_read","timetracking_write","package_read","package_write","project_read","project_write","list_issues","issue_read","issue_write","list_pull_requests","pull_request_read","pull_request_write","pull_request_review_write","actions_config_read","actions_config_write","actions_run_read","actions_run_write","repo_read","repo_write","get_repository_tree","get_file_contents","get_dir_contents","create_or_update_file","delete_file","branch_read","branch_write","tag_read","tag_write","commit_read","commit_write","release_read","release_write"];
const writeNames=["create_organization","notification_write","label_write","milestone_write","wiki_write","timetracking_write","package_write","project_write","issue_write","pull_request_write","pull_request_review_write","actions_config_write","actions_run_write","repo_write","create_or_update_file","delete_file","branch_write","tag_write","commit_write","release_write"];
const login=await post("/api/login",{username:S("SWAGGER_USERNAME"),password:S("SWAGGER_PASSWORD")});
assert.equal(login.status,200,"T14 playground login");const cookie=(login.headers.get("set-cookie")||"").split(";")[0];assert.ok(cookie);
const metaResponse=await req("/api/meta",{headers:{Cookie:cookie}});assert.equal(metaResponse.status,200);const meta=await metaResponse.json();assert.equal(meta.tools.length,48);assert.equal(meta.filters.totalCount,48);assert.equal(meta.filters.activeCount,48);assert.deepEqual(meta.tools.map(t=>t.name).sort(),[...expected].sort());
const list=await post("/mcp",{jsonrpc:"2.0",id:1,method:"tools/list",params:{}},{Authorization:"Bearer "+S("MCP_TOKEN")});assert.equal(list.status,200);const raw=await list.text();let rpc;try{rpc=JSON.parse(raw);}catch{const frames=raw.split(/\r?\n/).filter(x=>x.startsWith("data:")).map(x=>x.slice(5).trim());assert.ok(frames.length,"MCP tools/list JSON frame");rpc=JSON.parse(frames.at(-1));}const mcpTools=rpc.result?.tools||rpc.tools;assert.ok(Array.isArray(mcpTools));assert.equal(mcpTools.length,48);assert.deepEqual(mcpTools.map(t=>t.name).sort(),[...expected].sort());
const sr=await req("/api/samples",{headers:{Cookie:cookie}});assert.equal(sr.status,200);const samples=await sr.json();
const smoke=[
 ["get_gitea_mcp_server_version",{}],["get_me",{}],["get_user_orgs",{page:1,limit:5}],
 ["search_users",{q:"test",limit:5}],["search_org_teams",{org:"code-dh-hospital",q:"",limit:5}],["search_repos",{q:"dh-issue-listener",limit:5}],["search_issues",{q:"3556",limit:5}],
 ["notification_read",{method:"list",limit:5}],["label_read",{method:"list_repo"}],["milestone_read",{method:"list"}],["wiki_read",{method:"list"}],
 ["timetracking_read",{method:"list_user_times",limit:5}],["package_read",{method:"list"}],["project_read",{method:"list_repo",owner:"code-dh-hospital",repo:"dh-issue-listener"}],
 ["list_issues",{state:"all",limit:5}],["issue_read",{method:"get",owner:"hdhiswork",repo:"YEUCAU",index:1039}],
 ["list_pull_requests",{state:"open",limit:5,owner:"code-dh-hospital",repo:"dh-hos-code-only"}],["pull_request_read",{method:"get",index:390,owner:"code-dh-hospital",repo:"dh-hos-code-only"}],
 ["actions_config_read",{method:"list_variables",owner:"code-dh-hospital",repo:"dh-issue-listener"}],["actions_run_read",{method:"list_workflows",owner:"code-dh-hospital",repo:"dh-issue-listener"}],
 ["repo_read",{method:"get",owner:"code-dh-hospital",repo:"dh-issue-listener"}],
 ["get_repository_tree",{sha:"HEAD",owner:"code-dh-hospital",repo:"dh-issue-listener",recursive:true}],
 ["get_file_contents",{filepath:"README.md",ref:"main",owner:"code-dh-hospital",repo:"dh-issue-listener"}],
 ["get_dir_contents",{dirpath:"",ref:"main",owner:"code-dh-hospital",repo:"dh-issue-listener"}],
 ["branch_read",{method:"list",owner:"code-dh-hospital",repo:"dh-issue-listener"}],
 ["tag_read",{method:"list",owner:"code-dh-hospital",repo:"dh-issue-listener"}],
 ["commit_read",{method:"list",owner:"code-dh-hospital",repo:"dh-issue-listener"}],
 ["release_read",{method:"list",owner:"code-dh-hospital",repo:"dh-issue-listener"}]
];
let apiSuccess=0,mcpSuccess=0;
for(const [name,overrides] of smoke){
 const sampleInput=samples.inputs?.[name]||{};
 const input={...sampleInput,...overrides};
 if(!["get_gitea_mcp_server_version","get_me","get_user_orgs","search_users","search_org_teams","search_repos","search_issues","notification_read","timetracking_read","package_read"].includes(name)){
  if(input.owner===undefined)input.owner=samples.owner;
  if(input.repo===undefined)input.repo=samples.repo;
 }
 if(["search_org_teams","label_read","milestone_read","wiki_read","project_read"].includes(name)&&input.org===undefined)input.org=samples.owner||samples.me.login;
 if(name==="get_repository_tree"||name==="get_file_contents"||name==="get_dir_contents"||name==="repo_read"||name==="branch_read"||name==="tag_read"||name==="commit_read"||name==="release_read"||name==="project_read"||name==="actions_config_read"||name==="actions_run_read"){input.owner="code-dh-hospital";input.repo="dh-issue-listener";}
 const api=await post("/api/execute",{name,input},{Cookie:cookie});
 assert.notEqual(api.status,500,name+" /api/execute HTTP 500");
 const result=await api.json();assert.equal(typeof result.ok,"boolean",name+" structured API result");
 assert.equal(result.ok,true,name+" Gitea API tool execution: "+result.error);apiSuccess++;
 if(["get_repository_tree","get_file_contents","get_dir_contents"].includes(name))assert.equal(result.ok,true,name+" repository/file read regression");
 const call=await post("/mcp",{jsonrpc:"2.0",id:1,method:"tools/call",params:{name,arguments:input}},{Authorization:"Bearer "+S("MCP_TOKEN")});
 assert.equal(call.status,200,name+" MCP transport");
 const callRaw=await call.text();let callRpc;
 try{callRpc=JSON.parse(callRaw);}catch{const frames=callRaw.split(/\r?\n/).filter(x=>x.startsWith("data:")).map(x=>x.slice(5).trim());assert.ok(frames.length,name+" MCP JSON-RPC frame");callRpc=JSON.parse(frames.at(-1));}
 assert.ok(callRpc.result||callRpc.error,name+" MCP JSON-RPC result");
 assert.ok(callRpc.result,name+" MCP tool result");assert.notEqual(callRpc.result.isError,true,name+" MCP tool execution: "+(callRpc.result.content||[]).map(x=>x.text).join(" "));mcpSuccess++;
 if(["get_repository_tree","get_file_contents","get_dir_contents"].includes(name))assert.notEqual(callRpc.result?.isError,true,name+" MCP repository/file read regression");
}
for(const name of writeNames){
 const blocked=await post("/api/execute",{name,input:{},confirmation:false},{Cookie:cookie});
 assert.equal(blocked.status,403,name+" playground write safety guard");
 const body=await blocked.json();assert.equal(body.ok,false,name+" write must be blocked");assert.match(body.error,/Write tool blocked/,name+" write guard explanation");
}
assert.equal(apiSuccess,28,"all read tools succeed through API");assert.equal(mcpSuccess,28,"all read tools succeed through MCP");
console.log("T14 PASS: 48/48 exact tool names on MCP and API; all "+smoke.length+" read tools succeeded through both transports; "+writeNames.length+" write tools verified blocked without confirmation.");
