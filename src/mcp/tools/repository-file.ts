import { makeTool,GET,POST,PUT,PATCH,DELETE } from "../tool-runtime";
const R="/repos/{owner}/{repo}";
const repoPath=(owner:string,repo:string)=>`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

async function resolveTreeRef(owner:string,repo:string,ref:unknown,g:any):Promise<string>{
 const requested=String(ref??"").trim();
 if(requested&&requested.toUpperCase()!=="HEAD")return requested;
 const base=repoPath(owner,repo);
 const metadata=await g.request(base);
 const branch=String(metadata?.default_branch||"");
 if(!branch)throw new Error(`Unable to resolve Git tree ref for ${owner}/${repo}: repository default_branch is missing`);
 const branchInfo=await g.request(base+"/branches/"+encodeURIComponent(branch));
 const sha=String(branchInfo?.commit?.id||branchInfo?.commit?.sha||"");
 if(!sha)throw new Error(`Unable to resolve Git tree ref for ${owner}/${repo}: branch '${branch}' has no commit SHA`);
 return sha;
}

async function readTree(a:any,g:any,ref:unknown=a.sha,recursive=true){
 const sha=await resolveTreeRef(a.owner,a.repo,ref,g);
 const q=new URLSearchParams({recursive:recursive?"1":"0"});
 return g.request(repoPath(a.owner,a.repo)+"/git/trees/"+encodeURIComponent(sha)+"?"+q.toString());
}

function fileEntry(tree:any,filePath:string){
 return Array.isArray(tree?.tree)?tree.tree.find((entry:any)=>entry.path===filePath&&entry.type==="blob"):undefined;
}

async function readFileWithFallback(a:any,g:any){
 const filePath=String(a.filepath||a.path||"").replace(/^\/+|\/+$/g,"");
 if(!filePath)throw new Error("filepath or path is required");
 const base=repoPath(a.owner,a.repo);
 const encodedPath=filePath.split("/").map(encodeURIComponent).join("/");
 const direct=base+"/contents/"+encodedPath;
 let directError:unknown;
 try{
  const value=await g.request(direct+(a.ref?"?ref="+encodeURIComponent(a.ref):""));
  if(value?.content)return {...value,decoded_content:g.decodeContent(value.content)};
  if(value)return value;
 }catch(error){
  if(!/Gitea API 404/.test(String(error)))throw error;
  directError=error;
 }
 const tree=await readTree(a,g,a.ref||a.sha||a.branch,true);
 const entry=fileEntry(tree,filePath);
 if(!entry)throw directError||new Error(`File '${filePath}' was not found in ${a.owner}/${a.repo}`);
 const blob=await g.request(base+"/git/blobs/"+encodeURIComponent(entry.sha));
 if(!blob?.content)throw new Error(`Git blob ${entry.sha} for '${filePath}' has no content`);
 return {
  name:filePath.split("/").at(-1),
  path:filePath,
  sha:blob.sha||entry.sha,
  size:blob.size??entry.size,
  type:"file",
  encoding:blob.encoding||"base64",
  content:blob.content,
  decoded_content:g.decodeContent(blob.content)
 };
}

async function readDirectoryWithFallback(a:any,g:any){
 const dirPath=String(a.dirpath??a.path??"").replace(/^\/+|\/+$/g,"");
 const base=repoPath(a.owner,a.repo);
 const encodedPath=dirPath?dirPath.split("/").map(encodeURIComponent).join("/"):"";
 try{
  return await g.request(base+"/contents"+(encodedPath?"/"+encodedPath:"")+(a.ref?"?ref="+encodeURIComponent(a.ref):""));
 }catch(error){
  if(!/Gitea API 404/.test(String(error)))throw error;
 }
 const tree=await readTree(a,g,a.ref||a.sha||a.branch,true);
 if(!Array.isArray(tree?.tree))throw new Error("Gitea Git Trees response did not contain a tree array");
 const prefix=dirPath?dirPath+"/":"";
 const children=new Map<string,any>();
 for(const entry of tree.tree){
  const path=String(entry.path||"");
  if(!path.startsWith(prefix)||path===dirPath)continue;
  const relative=path.slice(prefix.length);
  if(!relative)continue;
  const parts=relative.split("/");
  const name=parts[0];
  if(parts.length===1){
   children.set(name,{...entry,name,path:prefix+name});
  }else if(!children.has(name)){
   children.set(name,{name,path:prefix+name,type:"tree",mode:"040000",size:0});
  }
 }
 return [...children.values()].sort((a,b)=>a.name.localeCompare(b.name));
}

export const repositoryFileTools=[
makeTool("repo_read","repository","read","Read repository metadata, user/org repositories and branch protections",{get:GET(R,undefined,["owner","repo"]),list_user:GET("/user/repos",["page","limit"]),list_org:GET("/orgs/{org}/repos",["page","limit"],["org"]),list_branch_protections:GET(R+"/branch_protections",undefined,["owner","repo"]),get_branch_protection:GET(R+"/branch_protections/{name}",undefined,["owner","repo","name"])},{method:"get",owner:"",repo:""}),
makeTool("repo_write","repository","write","Create, fork, update repository settings, topics and branch protections",{create_user_repo:POST("/user/repos",["name","description","private","auto_init","default_branch","gitignores","license","readme"],["name"]),create_org_repo:POST("/orgs/{org}/repos",["name","description","private","auto_init","default_branch"],["org","name"]),fork:POST(R+"/forks",["organization"],["owner","repo"]),update_settings:PATCH(R,["name","description","website","private","archived","default_branch","has_issues","has_wiki","has_pull_requests"],["owner","repo"]),update_topics:PUT(R+"/topics",["topics"],["owner","repo","topics"]),create_branch_protection:POST(R+"/branch_protections",["branch_name","enable_push","enable_push_whitelist","push_whitelist_usernames","push_whitelist_teams","enable_merge_whitelist","merge_whitelist_usernames","merge_whitelist_teams","required_approvals","block_on_rejected_reviews","block_on_official_review_requests","block_on_outdated_branch","dismiss_stale_approvals","require_signed_commits","protected_file_patterns","unprotected_file_patterns","required_status_checks"],["owner","repo","branch_name"]),update_branch_protection:PATCH(R+"/branch_protections/{name}",["enable_push","enable_push_whitelist","push_whitelist_usernames","push_whitelist_teams","enable_merge_whitelist","merge_whitelist_usernames","merge_whitelist_teams","required_approvals","block_on_rejected_reviews","block_on_official_review_requests","block_on_outdated_branch","dismiss_stale_approvals","require_signed_commits","protected_file_patterns","unprotected_file_patterns","required_status_checks"],["owner","repo","name"]),delete_branch_protection:DELETE(R+"/branch_protections/{name}",undefined,["owner","repo","name"])},{method:"create_user_repo",name:"mcp-test-repo"}),
makeTool("get_repository_tree","repository","read","Read a Git tree recursively or non-recursively; resolves HEAD to the repository default branch commit",{default:GET(R+"/git/trees/{sha}",["recursive"],["owner","repo"])},{owner:"",repo:"",sha:"HEAD",recursive:true},async(a,g)=>readTree(a,g,a.sha||a.ref||a.branch,a.recursive!==false)),
makeTool("get_file_contents","file","read","Read file content and decode Base64 as UTF-8; falls back to Git Trees and Blobs when the Contents API is unavailable",{default:GET(R+"/contents/{filepath}",["ref"],["owner","repo","filepath"])},{owner:"",repo:"",filepath:"README.md"},async(a,g)=>readFileWithFallback(a,g)),
makeTool("get_dir_contents","file","read","List files and directories at a repository path; falls back to Git Trees when the Contents API is unavailable",{default:GET(R+"/contents/{dirpath}",["ref"],["owner","repo"])},{owner:"",repo:"",dirpath:""},async(a,g)=>readDirectoryWithFallback(a,g)),
makeTool("create_or_update_file","file","write","Create, update or batch files in a single commit",{create:POST(R+"/contents/{filepath}",["content","message","branch","new_branch"],["owner","repo","filepath","content","message"]),update:PUT(R+"/contents/{filepath}",["content","sha","message","branch","new_branch"],["owner","repo","filepath","content","sha","message"]),batch:POST(R+"/contents",["files","message","branch","new_branch"],["owner","repo","files","message"])},{method:"create",owner:"",repo:"",filepath:"mcp-smoke.txt",content:"MCP smoke",message:"Add MCP smoke file"},async(a,g)=>{
 const branchName=a.branch_name||a.branch;const newBranchName=a.new_branch_name||a.new_branch;
 if(a.method==="batch")return g.request(R+"/contents",{method:"POST",body:JSON.stringify({files:a.files,message:a.message,branch_name:branchName,new_branch_name:newBranchName})});
 const filePath=String(a.filepath||a.path||"");if(!filePath)throw new Error("filepath or path is required");
 const method=a.method==="update"?"PUT":"POST";
 const body={...(a.content!==undefined?{content:g.encodeContent(a.content)}:{}),...(a.edits?{edits:a.edits}:{}),message:a.message,branch_name:branchName,new_branch_name:newBranchName,...(a.sha?{sha:a.sha}:{})};
 return g.request(R+"/contents/"+filePath.split("/").map(encodeURIComponent).join("/"),{method,body:JSON.stringify(body)});
}),
makeTool("delete_file","file","write","Delete a repository file by its blob SHA",{default:DELETE(R+"/contents/{filepath}",["sha","message","branch"],["owner","repo","filepath","sha","message"])},{owner:"",repo:"",filepath:"mcp-smoke.txt",sha:"",message:"Delete MCP smoke file"},async(a,g)=>{
 const filePath=String(a.filepath||a.path||"");if(!filePath)throw new Error("filepath or path is required");
 return g.request(R+"/contents/"+filePath.split("/").map(encodeURIComponent).join("/"),{method:"DELETE",body:JSON.stringify({sha:a.sha,message:a.message,branch_name:a.branch_name||a.branch})});
})
];
