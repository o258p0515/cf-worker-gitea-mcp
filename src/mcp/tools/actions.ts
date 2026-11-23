import { makeTool,GET,POST,PUT,DELETE } from "../tool-runtime";
const R="/repos/{owner}/{repo}";
async function listWorkflowsWithFallback(a:any,g:any){
 const base="/repos/"+encodeURIComponent(a.owner)+"/"+encodeURIComponent(a.repo);
 try{
  const q=new URLSearchParams();
  for(const key of ["page","limit"])if(a[key]!==undefined&&a[key]!==null&&a[key]!=="")q.set(key,String(a[key]));
  return await g.request(base+"/actions/workflows"+(q.size?"?"+q.toString():""));
 }catch(error){
  if(!/Gitea API (?:404|500)/.test(String(error)))throw error;
  const metadata=await g.request(base);
  const branch=String(metadata?.default_branch||"");
  if(!branch)return {workflows:[],source:"git_tree_fallback",supported:false,upstreamApiError:String(error),message:"Gitea Actions API failed and repository has no default branch to inspect."};
  const tree=await g.request(base+"/git/trees/"+encodeURIComponent(branch)+"?recursive=1");
  const workflows=(Array.isArray(tree?.tree)?tree.tree:[]).filter((entry:any)=>entry.type==="blob"&&/^\.(?:github|gitea)\/workflows\/[^/]+\.(?:ya?ml)$/i.test(String(entry.path||""))).map((entry:any)=>({id:entry.path,name:String(entry.path).split("/").at(-1),path:entry.path,sha:entry.sha,size:entry.size,state:"unknown"}));
  return {workflows,source:"git_tree_fallback",upstreamApiError:String(error),message:"Gitea Actions workflow listing API failed; workflow files were discovered from the repository Git tree. Run metadata, jobs and logs still require the Actions API."};
 }
}
const actionsRunReadTool=makeTool("actions_run_read","actions","read","List workflows, runs, jobs, logs and artifacts",{list_workflows:GET(R+"/actions/workflows",["page","limit"],["owner","repo"]),list_runs:GET(R+"/actions/runs",["page","limit","workflow_id","status","actor","branch","event"],["owner","repo"]),get_run:GET(R+"/actions/runs/{run_id}",undefined,["owner","repo","run_id"]),list_jobs:GET(R+"/actions/runs/{run_id}/jobs",["page","limit"],["owner","repo","run_id"]),get_job_logs:GET(R+"/actions/jobs/{job_id}/logs",undefined,["owner","repo","job_id"],true),list_artifacts:GET(R+"/actions/runs/{run_id}/artifacts",["page","limit"],["owner","repo","run_id"])},{method:"list_workflows",owner:"",repo:""});
const actionsRunReadOriginal=actionsRunReadTool.run;
actionsRunReadTool.run=async(a:any,g:any,meta:any)=>((a.method||"list_workflows")==="list_workflows"?listWorkflowsWithFallback(a,g):actionsRunReadOriginal(a,g,meta));
export const actionsTools=[
makeTool("actions_config_read","actions","read","List Actions secret names and variables or read a variable",{list_secrets:GET(R+"/actions/secrets",["page","limit"],["owner","repo"]),list_variables:GET(R+"/actions/variables",["page","limit"],["owner","repo"]),get_variable:GET(R+"/actions/variables/{name}",undefined,["owner","repo","name"])},{method:"list_variables",owner:"",repo:""}),
makeTool("actions_config_write","actions","write","Set/delete Actions secrets and create/update/delete variables; set_secret requires Gitea encrypted_value and key_id",{set_secret:PUT(R+"/actions/secrets/{name}",["encrypted_value","key_id"],["owner","repo","name","encrypted_value","key_id"]),delete_secret:DELETE(R+"/actions/secrets/{name}",undefined,["owner","repo","name"]),create_variable:POST(R+"/actions/variables",["name","value"],["owner","repo","name","value"]),update_variable:PUT(R+"/actions/variables/{name}",["value"],["owner","repo","name","value"]),delete_variable:DELETE(R+"/actions/variables/{name}",undefined,["owner","repo","name"])},{method:"create_variable",owner:"",repo:"",name:"MCP_TEST_VARIABLE",value:"test"}),
actionsRunReadTool,
makeTool("actions_run_write","actions","write","Dispatch, cancel, rerun, enable or disable Actions workflows",{dispatch:POST(R+"/actions/workflows/{workflow_id}/dispatches",["ref","inputs"],["owner","repo","workflow_id","ref"]),cancel:POST(R+"/actions/runs/{run_id}/cancel",undefined,["owner","repo","run_id"]),rerun:POST(R+"/actions/runs/{run_id}/rerun",undefined,["owner","repo","run_id"]),enable_workflow:PUT(R+"/actions/workflows/{workflow_id}/enable",undefined,["owner","repo","workflow_id"]),disable_workflow:PUT(R+"/actions/workflows/{workflow_id}/disable",undefined,["owner","repo","workflow_id"])},{method:"dispatch",owner:"",repo:"",workflow_id:"test.yml",ref:"main"})
];
