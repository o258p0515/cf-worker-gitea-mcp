import assert from "node:assert/strict";
const base="https://"+process.env.CF_DOMAIN, user=process.env.SWAGGER_USERNAME, pass=process.env.SWAGGER_PASSWORD;
const owner=process.env.GITEA_TEST_OWNER, repo=process.env.GITEA_TEST_REPO;
assert.ok(base&&user&&pass&&owner&&repo,"Production Swagger credentials and fixture secrets are required");
const auth="Basic "+Buffer.from(user+":"+pass).toString("base64");
async function call(name,input={},confirmation=false){
 const r=await fetch(base+"/api/execute",{method:"POST",headers:{Authorization:auth,Accept:"application/json","content-type":"application/json"},body:JSON.stringify({name,input,confirmation}),signal:AbortSignal.timeout(45000)});
 const b=await r.json();assert.equal(b.ok,true,name+" HTTP "+r.status+": "+b.error);return b.result??b.data;
}
const pages=await call("wiki_read",{method:"list",owner,repo});
const stale=(Array.isArray(pages)?pages:[]).filter(p=>String(p?.title||"").startsWith("mcp-e2e-")&&p?.sub_url);
for(const p of stale){await call("wiki_write",{method:"delete",owner,repo,page_name:p.sub_url},true);console.log("CLEANED stale E2E wiki page",p.sub_url)}
const after=await call("wiki_read",{method:"list",owner,repo});
const remaining=(Array.isArray(after)?after:[]).filter(p=>String(p?.title||"").startsWith("mcp-e2e-"));
assert.equal(remaining.length,0,"Stale E2E wiki pages remain: "+JSON.stringify(remaining));
console.log("Fixture wiki cleanup PASS; removed "+stale.length+" stale E2E pages.");
const issues=await call("list_issues",{owner,repo,state:"open",limit:100});
const staleIssues=(Array.isArray(issues)?issues:[]).filter(i=>i?.title==="[MCP E2E] Issue lifecycle verification");
for(const issue of staleIssues){await call("issue_write",{method:"update",index:issue.number,state:"closed"},true);console.log("CLOSED legacy E2E issue",issue.number)}
const openAfter=await call("list_issues",{owner,repo,state:"open",limit:100});
const remainingIssues=(Array.isArray(openAfter)?openAfter:[]).filter(i=>i?.title==="[MCP E2E] Issue lifecycle verification");
assert.equal(remainingIssues.length,0,"Legacy E2E issues remain open: "+JSON.stringify(remainingIssues));
console.log("Fixture issue cleanup PASS; closed "+staleIssues.length+" legacy E2E issues.");
