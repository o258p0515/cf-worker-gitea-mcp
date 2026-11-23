import {McpServer} from "@modelcontextprotocol/server";
import {createMcpHandler} from "agents/mcp/server";
import type {Env} from "./env";
import {Gitea} from "./gitea/client";
import {tools} from "./mcp/registry";
import {mcpAuth} from "./auth/middleware";
import {isAuthed,login,logout} from "./auth/swagger-auth";
import {oauth} from "./auth/oauth";
import {loginPage,playground} from "./ui/swagger";
import {BUILD_VERSION,DEPLOYED_AT_VN} from "./generated-version";
const j=(x:any,s=200)=>Response.json(x,{status:s});
async function run(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
 const u=new URL(request.url),p=u.pathname;
 if(p==="/healthz"){let reachable=false,error="";try{await new Gitea(env).me();reachable=true}catch(e){error=String(e)}return j({status:"ok",version:BUILD_VERSION,deployedAtVN:DEPLOYED_AT_VN,giteaReachable:reachable,...(!reachable?{giteaError:error}:{})},reachable?200:503)}
 const o=await oauth(request,env);if(o)return o;
 if(p==="/api/login"&&request.method==="POST")return login(request,env);
 if(p==="/api"&&request.method==="GET")return new Response(await isAuthed(request,env)?playground():loginPage(),{headers:{"Content-Type":"text/html;charset=utf-8"}});
 if(p.startsWith("/api/")){
  if(!await isAuthed(request,env))return j({error:"Unauthorized"},401);
  if(p==="/api/logout"&&request.method==="POST")return logout();
  const g=new Gitea(env);
  if(p==="/api/meta")return j({version:BUILD_VERSION,tools:tools.map(t=>({name:t.name,category:t.category,access:t.access,description:t.description,inputSchema:t.schema.toJSONSchema?.()||{}}))});
  if(p==="/api/samples"){try{const s=await g.sample(),R={owner:s.owner,repo:s.repo};return j({me:s.me,owner:s.owner,repo:s.repo,branch:s.branch,inputs:{get_gitea_mcp_server_version:{},get_me:{},get_user_orgs:{},search_repos:{q:""},repo_read:R,get_repository_tree:{...R,sha:s.branch},branch_read:R,get_file_contents:{...R,filepath:"README.md",ref:s.branch},create_or_update_file:{...R,filepath:"mcp-test.txt",content:"test",message:"test"},list_issues:{...R,state:"all"},issue_read:{...R,index:s.issueIndex},issue_write:{...R,title:"Test issue",body:"Test"},list_pull_requests:R,pull_request_read:{...R,index:1},commit_read:R}})}catch(e){return j({error:String(e)},502)}}
  if(p==="/api/execute"&&request.method==="POST"){try{const b:any=await request.json(),t=tools.find(x=>x.name===b.name);if(!t)return j({error:"Unknown tool"},404);return j({ok:true,result:await t.run(t.schema.parse(b.input||{}),g,{domain:env.CF_DOMAIN,giteaHost:env.GITEA_HOST})})}catch(e){return j({ok:false,error:String(e)},400)}}
 }
 if(p==="/mcp"){
  const a=await mcpAuth(request,env);
  if(!a.ok)return new Response("Unauthorized",{status:401,headers:{"WWW-Authenticate":'Bearer resource_metadata="https://'+env.CF_DOMAIN+'/.well-known/oauth-protected-resource"'}});
  const g=new Gitea(env,a.token||env.GITEA_ACCESS_TOKEN);
  const factory=()=>{const s=new McpServer({name:"gitea-mcp-worker",version:BUILD_VERSION});for(const t of tools)s.registerTool(t.name,{description:t.description,inputSchema:t.schema.shape},async(args:any)=>{try{return {content:[{type:"text",text:JSON.stringify(await t.run(args,g,{domain:env.CF_DOMAIN,giteaHost:env.GITEA_HOST}))}]}}catch(e){return {isError:true,content:[{type:"text",text:String(e)}]}}});return s};
  return createMcpHandler(factory,{route:"/mcp",allowedHostnames:[new URL(request.url).hostname],legacy:"stateless"})(request,env,ctx);
 }
 return new Response("Not Found",{status:404});
}
export default {fetch:run};
