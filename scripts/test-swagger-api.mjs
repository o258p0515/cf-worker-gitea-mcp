import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile, appendFile } from "node:fs/promises";
const base="https://"+process.env.CF_DOMAIN, user=process.env.SWAGGER_USERNAME, pass=process.env.SWAGGER_PASSWORD;
const owner=process.env.GITEA_TEST_OWNER, repo=process.env.GITEA_TEST_REPO;
assert.ok(base&&user&&pass&&owner&&repo,"CF_DOMAIN, Swagger credentials and Gitea fixture secrets are required");
const auth="Basic "+Buffer.from(user+":"+pass).toString("base64"), id="mcp-e2e-"+Date.now()+"-"+randomUUID().slice(0,8);
const req=(p,o={})=>fetch(base+p,{...o,headers:{Authorization:auth,Accept:"application/json",...(o.headers||{})},signal:AbortSignal.timeout(45000)});
const post=(p,b)=>req(p,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(b)});
const exec=async(n,input={},confirmation=false)=>{const r=await post("/api/execute",{name:n,input,confirmation});let b;try{b=await r.json()}catch{b={ok:false,error:"HTTP "+r.status+" non-JSON"}};return {r,b}};
const call=async(n,input={},write=false)=>{const {r,b}=await exec(n,input,write);assert.equal(b.ok,true,n+" HTTP "+r.status+": "+b.error);return b.result??b.data};
const results=[],counts={pass:0,fail:0,skip:0};
async function test(n,fn){try{const d=await fn();const s=d&&d.skip?"skip":"pass";counts[s]++;results.push({status:s,name:n,detail:d?.skip||d||""});console.log(s.toUpperCase(),n,d?.skip||d||"")}catch(e){counts.fail++;results.push({status:"fail",name:n,detail:String(e)});console.log("FAIL",n,String(e))}}
async function clean(n,fn){await test("cleanup:"+n,fn)}
const expected=["get_gitea_mcp_server_version","get_me","get_user_orgs","create_organization","search_users","search_org_teams","search_repos","search_issues","notification_read","notification_write","label_read","label_write","milestone_read","milestone_write","wiki_read","wiki_write","timetracking_read","timetracking_write","package_read","package_write","project_read","project_write","list_issues","issue_read","issue_write","list_pull_requests","pull_request_read","pull_request_write","pull_request_review_write","actions_config_read","actions_config_write","actions_run_read","actions_run_write","repo_read","repo_write","get_repository_tree","get_file_contents","get_dir_contents","create_or_update_file","delete_file","branch_read","branch_write","tag_read","tag_write","commit_read","commit_write","release_read","release_write"];
const writes=expected.filter(n=>["create_organization","notification_write","label_write","milestone_write","wiki_write","timetracking_write","package_write","project_write","issue_write","pull_request_write","pull_request_review_write","actions_config_write","actions_run_write","repo_write","create_or_update_file","delete_file","branch_write","tag_write","commit_write","release_write"].includes(n));
const page=await req("/api");assert.equal(page.status,200);assert.match(await page.text(),/Gitea MCP Playground|Gitea MCP Login/);
const mr=await req("/api/meta");assert.equal(mr.status,200);const meta=await mr.json();
assert.equal(meta.tools.length,48);assert.equal(meta.filters.totalCount,48);assert.equal(meta.filters.activeCount,48);
assert.deepEqual(meta.tools.map(t=>t.name).sort(),[...expected].sort());await test("registry:48 tools",async()=>"48/48 active and exact tool names");
const sr=await req("/api/samples");assert.equal(sr.status,200);const samples=await sr.json();assert.ok(samples.me?.login);assert.equal(samples.fixtureConfigured,true);
await test("samples + Gitea auth",async()=>"authenticated as "+samples.me.login+"; fixture "+owner+"/"+repo);
for(const n of writes)await test("write guard:"+n,async()=>{const {r,b}=await exec(n,{},false);assert.equal(r.status,403);assert.equal(b.ok,false);assert.match(b.error,/Write tool blocked/);return "403 without confirmation"});
const suffix=id.toLowerCase().replace(/[^a-z0-9-]/g,"-"), branch=suffix+"-branch", tag=suffix+"-tag";
let issueNo=1,prNo,reviewId;
await test("branch_write:create",async()=>{await call("branch_write",{method:"create",branch,old_branch:"main"},true);return branch});
await test("pull_request_write:create",async()=>{const x=await call("pull_request_write",{method:"create",title:suffix+"-pr",head:branch,base:"main",body:"Temporary "+id},true);prNo=x.number;assert.ok(prNo);return "PR #"+prNo});
if(prNo)await test("pull_request_read:get",async()=>{const x=await call("pull_request_read",{method:"get",index:prNo});assert.equal(Number(x.number),Number(prNo));return "read PR #"+prNo});
if(prNo){await test("pull_request_review_write:create",async()=>{const x=await call("pull_request_review_write",{method:"create",index:prNo,event:"COMMENT",body:"Temporary "+id},true);reviewId=x.id;assert.ok(reviewId);return "review "+reviewId});if(reviewId)await clean("PR review",()=>call("pull_request_review_write",{method:"delete",index:prNo,id:reviewId},true));await clean("PR close",()=>call("pull_request_write",{method:"update",index:prNo,state:"closed"},true))}
await clean("branch delete",()=>call("branch_write",{method:"delete",branch},true));
let labelId;await test("label_write:create",async()=>{const x=await call("label_write",{method:"create_repo",name:suffix+"-label",color:"336699",description:"Temporary E2E"},true);labelId=x.id;assert.ok(labelId);return "label "+labelId});if(labelId)await clean("label delete",()=>call("label_write",{method:"delete_repo",id:labelId},true));
let milestoneId;await test("milestone_write:create",async()=>{const x=await call("milestone_write",{method:"create",title:suffix+"-milestone",description:"Temporary E2E"},true);milestoneId=x.id;assert.ok(milestoneId);return "milestone "+milestoneId});if(milestoneId)await clean("milestone delete",()=>call("milestone_write",{method:"delete",id:milestoneId},true));
let wiki=false;await test("wiki_write:create",async()=>{await call("wiki_write",{method:"create",title:suffix+"-wiki",content:"Temporary "+id},true);wiki=true;return "wiki page created"});if(wiki)await clean("wiki delete",()=>call("wiki_write",{method:"delete",page_name:suffix+"-wiki"},true));
let issueCreated;await test("issue_write:create + close",async()=>{const x=await call("issue_write",{method:"create",title:suffix+"-issue",body:"Temporary "+id},true);issueCreated=x.number;assert.ok(issueCreated);await call("issue_write",{method:"update",index:issueCreated,state:"closed"},true);return "created and closed #"+issueCreated});
await test("tag_write:create",async()=>{await call("tag_write",{method:"create",tag_name:tag,target:"main",message:"Temporary "+id},true);return tag});await clean("tag delete",()=>call("tag_write",{method:"delete",name:tag},true));
const file="mcp-e2e/"+suffix+".txt";let fileCreated=false;
await test("create_or_update_file:create",async()=>{await call("create_or_update_file",{method:"create",filepath:file,content:"Swagger E2E "+id,message:"test add "+file,branch:"main"},true);fileCreated=true;return file});
if(fileCreated)await clean("delete_file",async()=>{const f=await call("get_file_contents",{owner,repo,filepath:file,ref:"main"});await call("delete_file",{filepath:file,sha:f.sha,message:"test delete "+file,branch:"main"},true)});
await test("timetracking_write:add/delete time",async()=>{const x=await call("timetracking_write",{method:"add_time",issue_number:1,time:60,user_name:samples.me.login},true);assert.ok(x.id);await call("timetracking_write",{method:"delete_time",issue_number:1,id:x.id},true);return "time entry "+x.id+" added/deleted"});
const workflow=".gitea/workflows/"+suffix+".yml";let wf=false;
await test("actions_run_write:dispatch",async()=>{const y="name: MCP API E2E\non:\n  workflow_dispatch:\njobs:\n  smoke:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo "+id+"\n";await call("create_or_update_file",{method:"create",filepath:workflow,content:y,message:"test add "+workflow,branch:"main"},true);wf=true;const x=await call("actions_run_write",{method:"dispatch",workflow_id:suffix+".yml",ref:"main",inputs:{}},true);return "dispatch accepted "+JSON.stringify(x).slice(0,150)});
if(wf)await clean("temporary workflow file",async()=>{const f=await call("get_file_contents",{owner,repo,filepath:workflow,ref:"main"});await call("delete_file",{filepath:workflow,sha:f.sha,message:"test remove "+workflow,branch:"main"},true)});
const variable=suffix.replace(/-/g,"_").toUpperCase();
await test("actions_config_write:create/delete variable",async()=>{await call("actions_config_write",{method:"create_variable",name:variable,value:id},true);await call("actions_config_write",{method:"delete_variable",name:variable},true);return "variable created/deleted"});
await test("repo_write:update_topics + restore",async()=>{const x=await call("repo_read",{method:"get"}),orig=Array.isArray(x.topics)?x.topics:[];try{await call("repo_write",{method:"update_topics",topics:[...orig,"mcp-e2e-"+Date.now()]},true)}finally{await call("repo_write",{method:"update_topics",topics:orig},true)}return "topics restored"});
await test("notification_write:mark_repo_read",async()=>{await call("notification_write",{method:"mark_repo_read"},true);return "repository notifications mark-read accepted"});
await test("commit_write:create status",async()=>{const r=await call("repo_read",{method:"get"}),b=await call("branch_read",{method:"get",branch:r.default_branch});assert.ok(b.commit?.id);await call("commit_write",{sha:b.commit.id,state:"success",context:"mcp-swagger-e2e",description:"Temporary "+id},true);return "status created"});
let releaseId;await test("release_write:create/delete",async()=>{const x=await call("release_write",{method:"create",tag_name:tag,target_commitish:"main",name:suffix+"-release",body:"Temporary "+id,draft:true},true);releaseId=x.id;assert.ok(releaseId);await call("release_write",{method:"delete",id:releaseId},true);return "draft release "+releaseId+" created/deleted"});
await test("project_write:capability",async()=>{const x=await call("project_write",{method:"create_repo_project",title:suffix+"-project"},true);return x?.supported===false?{skip:"Gitea Projects API unsupported: "+(x.message||x.reason)}:"project API returned "+JSON.stringify(x).slice(0,150)});
const readTools=meta.tools.filter(t=>t.access==="read");
for(const t of readTools)await test("read:"+t.name,async()=>{
 const a={...(samples.inputs?.[t.name]||{})};
 if(["repo_read","get_repository_tree","get_file_contents","get_dir_contents","branch_read","tag_read","commit_read","release_read","list_issues","issue_read","list_pull_requests","pull_request_read","actions_config_read","actions_run_read","label_read","milestone_read","wiki_read","project_read"].includes(t.name)){a.owner=owner;a.repo=repo}
 if(t.name==="search_org_teams")a.org="code-dh-hospital";
 if(t.name==="search_users")a.q=samples.me.login;
 if(t.name==="search_repos")a.q=repo;
 if(t.name==="search_issues")a.q=suffix;
 if(t.name==="issue_read"){a.method="get";a.index=issueCreated||1}
 if(t.name==="pull_request_read"){a.method="get";a.index=prNo||1}
 if(t.name==="get_file_contents"){a.filepath="README.md";a.ref="main"}
 if(t.name==="get_dir_contents"){a.dirpath="";a.ref="main"}
 const x=await call(t.name,a,false);
 if(t.name==="get_repository_tree")assert.ok(Array.isArray(x.tree)&&x.tree.length);
 if(t.name==="get_file_contents")assert.ok(typeof x.decoded_content==="string"&&x.decoded_content.length);
 if(t.name==="get_dir_contents")assert.ok(Array.isArray(x)&&x.length);
 if(t.name==="project_read"&&x?.supported===false)return {skip:"Projects API unsupported: "+(x.message||x.reason)};
 return "ok=true";
});
if(issueCreated)await clean("created issue closed",()=>call("issue_write",{method:"update",index:issueCreated,state:"closed"},true));
const summary={runId:id,production:base,fixture:owner+"/"+repo,registered:meta.tools.length,counts,results,notExecutedForSafety:{create_organization:"Global organization creation is outside the repo fixture",package_write:"Deletes an existing package version; destructive without a disposable package fixture"}};
await writeFile("swagger-api-results.json",JSON.stringify(summary,null,2));
const md=["## Swagger API E2E "+id,"- Production: "+base,"- Fixture: "+owner+"/"+repo,"- Tools registered: "+meta.tools.length+"/48","- PASS: "+counts.pass+"; FAIL: "+counts.fail+"; SKIP: "+counts.skip,"","| Status | Test | Detail |","|---|---|---|",...results.map(x=>"| "+x.status+" | "+x.name+" | "+String(x.detail).replaceAll("|","\\\\|").replaceAll("\n"," ")+" |")].join("\n");
if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,md+"\n");
console.log("SWAGGER E2E: "+counts.pass+" PASS, "+counts.fail+" FAIL, "+counts.skip+" SKIP; 48 tools registered");
if(counts.fail)process.exitCode=1;
