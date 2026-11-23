import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {pathToFileURL} from "node:url";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {mask} from "./mask.mjs";
const temp=await mkdtemp(join(tmpdir(),"gitea-v2-tests-"));
async function bundle(entry,name){const outfile=join(temp,name+".mjs");await build({entryPoints:[entry],bundle:true,platform:"node",format:"esm",outfile,logLevel:"silent"});return import(pathToFileURL(outfile).href);}
const [{tools,TOOL_NAMES},filter,client,repository,management]=await Promise.all([bundle("src/mcp/registry.ts","registry"),bundle("src/mcp/filter.ts","filter"),bundle("src/gitea/client.ts","client"),bundle("src/mcp/tools/repository-file.ts","repository-file"),bundle("src/mcp/tools/management.ts","management")]);
test("V2 registry contains exactly 48 unique tool names",()=>{assert.equal(tools.length,48);assert.equal(new Set(TOOL_NAMES).size,48);const expected=["get_gitea_mcp_server_version","get_me","get_user_orgs","create_organization","search_users","search_org_teams","search_repos","search_issues","notification_read","notification_write","label_read","label_write","milestone_read","milestone_write","wiki_read","wiki_write","timetracking_read","timetracking_write","package_read","package_write","project_read","project_write","list_issues","issue_read","issue_write","list_pull_requests","pull_request_read","pull_request_write","pull_request_review_write","actions_config_read","actions_config_write","actions_run_read","actions_run_write","repo_read","repo_write","get_repository_tree","get_file_contents","get_dir_contents","create_or_update_file","delete_file","branch_read","branch_write","tag_read","tag_write","commit_read","commit_write","release_read","release_write"];assert.deepEqual([...TOOL_NAMES].sort(),expected.sort());});
test("all tools have descriptions, object schemas and valid sample methods",()=>{for(const t of tools){assert.ok(t.description.length>8,t.name);assert.equal(t.schema.toJSONSchema().type,"object",t.name);assert.ok(t.sampleInput&&typeof t.sampleInput==="object",t.name);const methods=t.schema.toJSONSchema().properties?.method?.enum;if(methods)assert.ok(methods.includes(t.sampleInput.method),t.name);}});
test("default filter activates all tools and read-only hides writes",()=>{assert.equal(filter.getActiveTools(tools,{}).length,48);const active=filter.getActiveTools(tools,{GITEA_READONLY:"true"});assert.ok(active.length>0&&active.length<48);assert.ok(active.every(t=>t.access==="read"));});
test("scope and named-tool allowlists are unioned before read-only",()=>{const active=filter.getActiveTools(tools,{GITEA_SCOPES:"issue, branch",GITEA_TOOLS:"get_me"});assert.ok(active.some(t=>t.scope==="issue"));assert.ok(active.some(t=>t.scope==="branch"));assert.ok(active.some(t=>t.name==="get_me"));const read=filter.getActiveTools(tools,{GITEA_SCOPES:"issue,branch",GITEA_TOOLS:"get_me",GITEA_READONLY:"1"});assert.ok(read.every(t=>t.access==="read"));});
test("scope-only and tool-only filters are exact",()=>{assert.ok(filter.getActiveTools(tools,{GITEA_SCOPES:"issue,branch"}).every(t=>["issue","branch"].includes(t.scope)));assert.deepEqual(filter.getActiveTools(tools,{GITEA_TOOLS:"get_me,search_repos"}).map(t=>t.name).sort(),["get_me","search_repos"]);});
test("Base64 decoding preserves Vietnamese UTF-8",()=>{const g=new client.Gitea({GITEA_HOST:"https://gitea.invalid",GITEA_ACCESS_TOKEN:"test"});const expected="Tiếng Việt: đường dẫn, tổ chức, nhánh";assert.equal(g.decodeContent(btoa(unescape(encodeURIComponent(expected)))),expected);});
test("get_repository_tree resolves HEAD through repository default branch",async()=>{
 const calls=[];
 const tool=repository.repositoryFileTools.find(t=>t.name==="get_repository_tree");
 const g={request:async path=>{calls.push(path);if(path==="/repos/acme/demo")return {default_branch:"main"};if(path==="/repos/acme/demo/branches/main")return {commit:{id:"abc123"}};if(path==="/repos/acme/demo/git/trees/abc123?recursive=1")return {sha:"abc123",tree:[]};throw new Error("Unexpected request "+path);}};
 const result=await tool.run({owner:"acme",repo:"demo",sha:"HEAD",recursive:true},g,{});
 assert.equal(result.sha,"abc123");
 assert.deepEqual(calls,["/repos/acme/demo","/repos/acme/demo/branches/main","/repos/acme/demo/git/trees/abc123?recursive=1"]);
});
test("get_file_contents falls back from unavailable Contents API to Git blob",async()=>{
 const tool=repository.repositoryFileTools.find(t=>t.name==="get_file_contents");
 const expected="Nội dung tiếng Việt";
 const encoded=btoa(unescape(encodeURIComponent(expected)));
 const calls=[];
 const g={request:async path=>{calls.push(path);if(path==="/repos/acme/demo/contents/docs/README.md?ref=main")throw new Error("Gitea API 404: not found");if(path==="/repos/acme/demo/git/trees/main?recursive=1")return {tree:[{path:"docs/README.md",type:"blob",sha:"blob123",size:encoded.length}]};if(path==="/repos/acme/demo/git/blobs/blob123")return {sha:"blob123",size:encoded.length,encoding:"base64",content:encoded};throw new Error("Unexpected request "+path);},decodeContent:value=>new TextDecoder().decode(Uint8Array.from(atob(value),c=>c.charCodeAt(0)))};
 const result=await tool.run({owner:"acme",repo:"demo",filepath:"docs/README.md",ref:"main"},g,{});
 assert.equal(result.path,"docs/README.md");
 assert.equal(result.sha,"blob123");
 assert.equal(result.decoded_content,expected);
 assert.deepEqual(calls,["/repos/acme/demo/contents/docs/README.md?ref=main","/repos/acme/demo/git/trees/main?recursive=1","/repos/acme/demo/git/blobs/blob123"]);
});
test("get_dir_contents falls back to Git Trees and returns immediate children",async()=>{
 const tool=repository.repositoryFileTools.find(t=>t.name==="get_dir_contents");
 const g={request:async path=>{if(path==="/repos/acme/demo/contents/src?ref=main")throw new Error("Gitea API 404: not found");if(path==="/repos/acme/demo/git/trees/main?recursive=1")return {tree:[{path:"README.md",type:"blob",sha:"a"},{path:"src",type:"tree",sha:"b"},{path:"src/index.ts",type:"blob",sha:"c",size:10},{path:"src/nested",type:"tree",sha:"d"},{path:"src/nested/file.ts",type:"blob",sha:"e",size:20}]};throw new Error("Unexpected request "+path);}};
 const result=await tool.run({owner:"acme",repo:"demo",dirpath:"src",ref:"main"},g,{});
 assert.deepEqual(result.map(x=>x.name),["index.ts","nested"]);
 assert.equal(result[0].type,"blob");
 assert.equal(result[1].type,"tree");
});
test("project read endpoints use repository-scoped Gitea routes",async()=>{
 const tool=management.managementTools.find(t=>t.name==="project_read");
 const calls=[];const g={request:async(path,init)=>{calls.push({path,init});return [];}};
 await tool.run({method:"list_repo",owner:"acme",repo:"demo"},g,{});
 await tool.run({method:"get",owner:"acme",repo:"demo",id:7},g,{});
 await tool.run({method:"list_columns",owner:"acme",repo:"demo",id:7},g,{});
 await tool.run({method:"list_column_issues",owner:"acme",repo:"demo",id:7,column_id:2},g,{});
 assert.deepEqual(calls.map(x=>x.path),["/repos/acme/demo/projects","/repos/acme/demo/projects/7","/repos/acme/demo/projects/7/columns","/repos/acme/demo/projects/7/columns/2/issues"]);
});
test("project issue move uses the project-scoped endpoint and JSON body",async()=>{
 const tool=management.managementTools.find(t=>t.name==="project_write");
 const calls=[];const g={request:async(path,init)=>{calls.push({path,init});return {};}};
 await tool.run({method:"move_issue",owner:"acme",repo:"demo",id:7,issue_id:123,column_id:2,sorting:1},g,{});
 assert.equal(calls[0].path,"/repos/acme/demo/projects/7/issues/123/move");
 assert.equal(calls[0].init.method,"POST");
 assert.deepEqual(JSON.parse(calls[0].init.body),{column_id:2,sorting:1});
});
await rm(temp,{recursive:true,force:true});
