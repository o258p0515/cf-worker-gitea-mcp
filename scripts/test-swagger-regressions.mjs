import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const base="https://"+process.env.CF_DOMAIN,username=process.env.SWAGGER_USERNAME||"",password=process.env.SWAGGER_PASSWORD||"";
const owner=process.env.GITEA_TEST_OWNER||"",repo=process.env.GITEA_TEST_REPO||"";
const giteaHost=(process.env.GITEA_HOST||"").replace(/\/+$/,""),giteaToken=process.env.GITEA_ACCESS_TOKEN||"";
assert.ok(base&&username&&password&&owner&&repo,"Swagger credentials and fixture repo are required");
assert.ok(giteaHost&&giteaToken,"GITEA_HOST and GITEA_ACCESS_TOKEN are required to create a disposable package fixture");
const auth="Basic "+Buffer.from(username+":"+password).toString("base64");
const request=(path,init={})=>fetch(base+path,{...init,headers:{Authorization:auth,Accept:"application/json",...(init.headers||{})},signal:AbortSignal.timeout(45000)});
async function execute(name,input={},confirmation=false){const r=await request("/api/execute",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name,input,confirmation})});let body;try{body=await r.json()}catch{body={ok:false,error:"non-JSON response"}}return {status:r.status,body};}
async function call(name,input={},confirmation=false){const x=await execute(name,input,confirmation);assert.equal(x.body.ok,true,name+" HTTP "+x.status+": "+x.body.error);return x.body.result??x.body.data;}
const runId="mcp-regression-"+Date.now()+"-"+randomUUID().slice(0,8),packageName=runId.toLowerCase().replace(/[^a-z0-9._-]/g,"-"),packageVersion="0.0.1";
let issueNumber,packageUploaded=false;
try{
 const file=await call("get_file_contents",{owner,repo,filepath:"README.md",ref:"main"});
 assert.equal(file.path,"README.md");assert.equal(typeof file.decoded_content,"string");assert.ok(file.decoded_content.length>0);
 console.log("PASS get_file_contents: decoded README ("+file.decoded_content.length+" chars)");
 const created=await call("issue_write",{method:"create",title:runId,body:"Temporary regression fixture "+runId},true);issueNumber=created.number;
 assert.ok(Number.isInteger(issueNumber));
 const updated=await call("issue_write",{index:issueNumber,title:runId+"-updated",body:"Updated without explicit method"},true);
 assert.equal(Number(updated.number),Number(issueNumber));
 const issue=await call("issue_read",{method:"get",owner,repo,index:issueNumber});assert.equal(issue.title,runId+"-updated");
 console.log("PASS issue_write inferred update: issue #"+issueNumber+" unchanged");
 const commentText="Regression comment "+runId;await call("issue_write",{index:issueNumber,comment:commentText},true);
 const comments=await call("issue_read",{method:"comments",owner,repo,index:issueNumber});
 assert.ok(Array.isArray(comments)&&comments.some(c=>c.body===commentText));
 console.log("PASS issue_write inferred comment: issue #"+issueNumber);
 const packagePath="/api/packages/"+encodeURIComponent(owner)+"/generic/"+encodeURIComponent(packageName)+"/"+packageVersion+"/fixture.txt";
 const upload=await fetch(giteaHost+packagePath,{method:"PUT",headers:{Authorization:"token "+giteaToken,"Content-Type":"application/octet-stream"},body:"Temporary package fixture "+runId,signal:AbortSignal.timeout(45000)});
 assert.ok(upload.ok,"Failed to create disposable package fixture: HTTP "+upload.status+" "+(await upload.text()).slice(0,400));packageUploaded=true;
 console.log("PASS package fixture upload: "+packageName+":"+packageVersion);
 const deleted=await call("package_write",{owner,type:"generic",name:packageName,version:packageVersion},true);
 console.log("PASS package_write delete: "+packageName+":"+packageVersion+" "+JSON.stringify(deleted??null));
 const verify=await execute("package_read",{method:"get",owner,type:"generic",name:packageName,version:packageVersion});
 assert.equal(verify.body.ok,false,"package version still exists after package_write");
 assert.match(String(verify.body.error),/Gitea API 404/,"package_read after deletion should return upstream 404, got "+JSON.stringify(verify.body));
 packageUploaded=false;console.log("PASS package_write verification: package version no longer exists");
}finally{
 if(issueNumber){const cleanup=await execute("issue_write",{method:"update",index:issueNumber,state:"closed"},true);if(!cleanup.body.ok)console.error("CLEANUP REQUIRED: issue #"+issueNumber+" remains; "+cleanup.body.error);}
 if(packageUploaded)console.error("CLEANUP REQUIRED: package fixture remains: "+owner+"/generic/"+packageName+"/"+packageVersion);
}
console.log("REGRESSION SUITE PASS");
