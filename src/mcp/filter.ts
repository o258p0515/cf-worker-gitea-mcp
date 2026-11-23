import type {Env} from "../env";import type {ToolDef} from "./types";
type F=Pick<Env,"GITEA_READONLY"|"GITEA_SCOPES"|"GITEA_TOOLS">;
const csv=(v?:string)=>(v||"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
export function getActiveTools<T extends ToolDef>(all:T[],env:F):T[]{const scopes=csv(env.GITEA_SCOPES),names=csv(env.GITEA_TOOLS),hs=scopes.length>0,hn=names.length>0,ro=/^(true|1)$/i.test(env.GITEA_READONLY||"");return all.filter(t=>(!hs&&!hn||(hs&&scopes.includes(t.scope.toLowerCase()))||(hn&&names.includes(t.name.toLowerCase())))&&!(ro&&t.access==="write"));}
export function filterState(all:ToolDef[],env:F){return {readOnly:/^(true|1)$/i.test(env.GITEA_READONLY||""),scopes:csv(env.GITEA_SCOPES),tools:csv(env.GITEA_TOOLS),activeCount:getActiveTools(all,env).length,totalCount:all.length};}
