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
const [{tools,TOOL_NAMES},filter,client]=await Promise.all([bundle("src/mcp/registry.ts","registry"),bundle("src/mcp/filter.ts","filter"),bundle("src/gitea/client.ts","client")]);
test("V2 registry contains exactly 48 unique tool names",()=>{assert.equal(tools.length,48);assert.equal(new Set(TOOL_NAMES).size,48);const expected=["get_gitea_mcp_server_version","get_me","get_user_orgs","create_organization","search_users","search_org_teams","search_repos","search_issues","notification_read","notification_write","label_read","label_write","milestone_read","milestone_write","wiki_read","wiki_write","timetracking_read","timetracking_write","package_read","package_write","project_read","project_write","list_issues","issue_read","issue_write","list_pull_requests","pull_request_read","pull_request_write","pull_request_review_write","actions_config_read","actions_config_write","actions_run_read","actions_run_write","repo_read","repo_write","get_repository_tree","get_file_contents","get_dir_contents","create_or_update_file","delete_file","branch_read","branch_write","tag_read","tag_write","commit_read","commit_write","release_read","release_write"];assert.deepEqual([...TOOL_NAMES].sort(),expected.sort());});
test("all tools have descriptions, object schemas and valid sample methods",()=>{for(const t of tools){assert.ok(t.description.length>8,t.name);assert.equal(t.schema.toJSONSchema().type,"object",t.name);assert.ok(t.sampleInput&&typeof t.sampleInput==="object",t.name);const methods=t.schema.toJSONSchema().properties?.method?.enum;if(methods)assert.ok(methods.includes(t.sampleInput.method),t.name);}});
test("default filter activates all tools and read-only hides writes",()=>{assert.equal(filter.getActiveTools(tools,{}).length,48);const active=filter.getActiveTools(tools,{GITEA_READONLY:"true"});assert.ok(active.length>0&&active.length<48);assert.ok(active.every(t=>t.access==="read"));});
test("scope and named-tool allowlists are unioned before read-only",()=>{const active=filter.getActiveTools(tools,{GITEA_SCOPES:"issue, branch",GITEA_TOOLS:"get_me"});assert.ok(active.some(t=>t.scope==="issue"));assert.ok(active.some(t=>t.scope==="branch"));assert.ok(active.some(t=>t.name==="get_me"));const read=filter.getActiveTools(tools,{GITEA_SCOPES:"issue,branch",GITEA_TOOLS:"get_me",GITEA_READONLY:"1"});assert.ok(read.every(t=>t.access==="read"));});
test("scope-only and tool-only filters are exact",()=>{assert.ok(filter.getActiveTools(tools,{GITEA_SCOPES:"issue,branch"}).every(t=>["issue","branch"].includes(t.scope)));assert.deepEqual(filter.getActiveTools(tools,{GITEA_TOOLS:"get_me,search_repos"}).map(t=>t.name).sort(),["get_me","search_repos"]);});
test("Base64 decoding preserves Vietnamese UTF-8",()=>{const g=new client.Gitea({GITEA_HOST:"https://gitea.invalid",GITEA_ACCESS_TOKEN:"test"});const expected="Tiếng Việt: đường dẫn, tổ chức, nhánh";assert.equal(g.decodeContent(btoa(unescape(encodeURIComponent(expected)))),expected);});
await rm(temp,{recursive:true,force:true});
