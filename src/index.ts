import {McpServer} from "@modelcontextprotocol/server";
import {createMcpHandler} from "agents/mcp/server";
import type {Env} from "./env";
import {Gitea} from "./gitea/client";
import {tools} from "./mcp/registry";
import {getActiveTools,filterState} from "./mcp/filter";
import {mcpAuth} from "./auth/middleware";
import {isAuthed,login,logout} from "./auth/swagger-auth";
import {oauth} from "./auth/oauth";
import {loginPage,playground} from "./ui/swagger";
import {BUILD_VERSION,DEPLOYED_AT_VN} from "./generated-version";
interface ExecutionContext{waitUntil(promise:Promise<unknown>):void;passThroughOnException():void;}
const j=(x:unknown,s=200)=>Response.json(x,{status:s});
async function run(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
 const u=new URL(request.url),p=u.pathname,active=getActiveTools(tools,env),filters=filterState(tools,env);
 const meta={domain:env.CF_DOMAIN,giteaHost:new URL(env.GITEA_HOST).origin,activeToolsCount:active.length};
 if(p==="/healthz"){let reachable=false,error="";try{await new Gitea(env).me();reachable=true;}catch(e){error=String(e);}return j({status:"ok",version:BUILD_VERSION,deployedAtVN:DEPLOYED_AT_VN,giteaReachable:reachable,tools:{total:tools.length,active:active.length},...(!reachable?{giteaError:error}:{})},reachable?200:503);}
 const o=await oauth(request,env);if(o)return o;
 if(p==="/api/login"&&request.method==="POST")return login(request,env);
 if(p==="/api"&&request.method==="GET")return new Response(await isAuthed(request,env)?playground():loginPage(),{headers:{"Content-Type":"text/html;charset=utf-8","Cache-Control":"no-store"}});
 if(p.startsWith("/api/")){
  if(!await isAuthed(request,env))return j({error:"Unauthorized"},401);
  if(p==="/api/logout"&&request.method==="POST")return logout();
  const g=new Gitea(env);
  if(p==="/api/meta"&&request.method==="GET")return j({version:BUILD_VERSION,filters,tools:active.map(t=>({name:t.name,scope:t.scope,category:t.category,access:t.access,description:t.description,extension:!!t.extension,upstream:t.upstream,inputSchema:t.schema.toJSONSchema?.()||{}}))});
  if(p==="/api/samples"&&request.method==="GET"){try{const s=await g.sample(),inputs:Record<string,unknown>={};for(const t of active){const a={...t.sampleInput} as Record<string,any>;for(const k of ["owner","repo","org","branch"])if(k in a&&s[k as keyof typeof s])a[k]=s[k as keyof typeof s];if("sha" in a&&(!a.sha||a.sha==="HEAD"))a.sha=s.branch;if("index" in a)a.index=s.issueIndex;if("issue_number" in a)a.issue_number=s.issueIndex;if("issue_index" in a)a.issue_index=s.issueIndex;if("dirpath" in a&&!a.dirpath)a.dirpath="";inputs[t.name]=a;}return j({me:s.me,owner:s.owner,repo:s.repo,branch:s.branch,inputs,fixtureConfigured:!!(env.GITEA_TEST_OWNER&&env.GITEA_TEST_REPO)});}catch(e){return j({error:String(e)},502);}}
  if(p==="/api/execute"&&request.method==="POST"){let b:any;try{b=await request.json();}catch{return j({ok:false,error:"Malformed JSON"},400);}const t=tools.find(x=>x.name===b?.name);if(!t)return j({ok:false,error:"Unknown tool"},404);if(!active.some(x=>x.name===t.name))return j({ok:false,error:"Tool disabled by GITEA_READONLY/GITEA_SCOPES/GITEA_TOOLS"},403);let input=b.input||{};if(t.access==="write"){if(b.confirmation!==true||!env.GITEA_TEST_OWNER||!env.GITEA_TEST_REPO)return j({ok:false,error:"Write tool blocked: require confirmation=true and dedicated GITEA_TEST_OWNER/GITEA_TEST_REPO fixture"},403);input={...input,owner:env.GITEA_TEST_OWNER,repo:env.GITEA_TEST_REPO,confirmation:true};}let parsed:any;try{parsed=t.schema.parse(input);}catch(e){return j({ok:false,error:String(e)},400);}try{return j({ok:true,result:await t.run(parsed,g,meta)});}catch(e){const m=String(e),status=/Gitea API 404/.test(m)?404:/Gitea API 409/.test(m)?409:/Gitea API 422/.test(m)?422:/Gitea API 429/.test(m)?429:/Gitea API 5\d\d/.test(m)?502:400;return j({ok:false,error:m},status);}}
 }
 if(p==="/mcp"){const a=await mcpAuth(request,env);if(!a.ok)return new Response("Unauthorized",{status:401,headers:{"WWW-Authenticate":'Bearer resource_metadata="https://'+env.CF_DOMAIN+'/.well-known/oauth-protected-resource"'}});const g=new Gitea(env,a.token||env.GITEA_ACCESS_TOKEN);const factory=()=>{const s=new McpServer({name:"gitea-mcp-worker",version:BUILD_VERSION});for(const t of active)s.registerTool(t.name,{description:t.description,inputSchema:t.schema},async(args:any)=>{try{return {content:[{type:"text" as const,text:JSON.stringify(await t.run(args,g,meta))}]};}catch(e){return {isError:true as const,content:[{type:"text" as const,text:String(e)}]};}});return s;};return createMcpHandler(factory,{route:"/mcp",allowedHostnames:[env.CF_DOMAIN],legacy:"stateless"})(request,env,ctx);}
 return new Response("Not Found",{status:404});
}
export default {fetch:run};
