import { z } from "zod";
import type { Gitea } from "../gitea/client";
import type { ToolDef } from "./types";
const S=z.string();
export const fields:Record<string,z.ZodTypeAny>={
 owner:S.optional(),repo:S.optional(),org:S.optional(),username:S.optional(),full_name:S.optional(),description:S.optional(),visibility:S.optional(),website:S.optional(),
 q:S.optional(),query:S.optional(),uid:z.number().optional(),topic:S.optional(),type:S.optional(),state:S.optional(),labels:z.union([S,z.array(S)]).optional(),sort:S.optional(),order:S.optional(),
 page:z.number().int().min(1).optional(),limit:z.number().int().min(1).max(100).optional(),per_page:z.number().int().min(1).max(100).optional(),
 index:z.number().int().positive().optional(),issue_number:z.number().int().positive().optional(),issue_index:z.number().int().positive().optional(),id:z.union([S,z.number()]).optional(),run_id:z.number().int().optional(),job_id:z.number().int().optional(),asset_id:z.number().int().optional(),column_id:z.number().int().optional(),
 branch:S.optional(),new_branch:S.optional(),old_branch:S.optional(),new_name:S.optional(),base:S.optional(),head:S.optional(),basehead:S.optional(),sha:S.optional(),ref:S.optional(),filepath:S.optional(),dirpath:S.optional(),path:S.optional(),branch_name:S.optional(),new_branch_name:S.optional(),edits:z.array(z.unknown()).optional(),rule_name:S.optional(),options:z.record(S,z.unknown()).optional(),page_name:S.optional(),name:S.optional(),version:S.optional(),title:S.optional(),body:S.optional(),content:S.optional(),message:S.optional(),comment:S.optional(),
 color:S.optional(),due_on:S.optional(),due_date:S.optional(),milestone:z.number().optional(),assignees:z.array(S).optional(),reviewers:z.array(S).optional(),team_reviewers:z.array(S).optional(),topics:z.array(S).optional(),recursive:z.boolean().optional(),include_description:z.boolean().optional(),
 private:z.boolean().optional(),is_private:z.boolean().optional(),auto_init:z.boolean().optional(),default_branch:S.optional(),gitignores:S.optional(),license:S.optional(),readme:S.optional(),has_issues:z.boolean().optional(),has_wiki:z.boolean().optional(),has_pull_requests:z.boolean().optional(),archived:z.boolean().optional(),is_archived:z.boolean().optional(),
 tag_name:S.optional(),target:S.optional(),target_commitish:S.optional(),draft:z.boolean().optional(),prerelease:z.boolean().optional(),event:S.optional(),context:S.optional(),target_url:S.optional(),workflow_id:z.union([S,z.number()]).optional(),inputs:z.record(S,z.unknown()).optional(),time:z.number().optional(),dependency_index:z.number().int().optional(),
 content_base64:S.optional(),value:S.optional(),board_type:S.optional(),file:S.optional(),files:z.array(z.unknown()).optional(),organization:S.optional(),merge_style:S.optional(),Do:S.optional(),force_merge:z.boolean().optional(),delete_branch_after_merge:z.boolean().optional(),comments:z.array(z.unknown()).optional(),encrypted_value:S.optional(),key_id:S.optional(),last_read_at:S.optional(),status_types:S.optional(),since:S.optional(),before:S.optional(),user_name:S.optional(),created:S.optional(),confirmation:z.literal(true).optional(),method:S.optional()
};
export type Route={method:string;path:string;body?:string[];query?:string[];required?:string[];raw?:boolean};
const enc=(v:unknown)=>encodeURIComponent(String(v??""));
function specialClient(g:Gitea,a:Record<string,any>):Gitea{
 return new Proxy(g,{get(target,key){
  if(key==="request")return (route:string,init?:RequestInit)=>{
   const resolved=route.replace(/\{owner\}/g,()=>{if(!a.owner)throw new Error("owner is required for this Gitea API route");return enc(a.owner)}).replace(/\{repo\}/g,()=>{if(!a.repo)throw new Error("repo is required for this Gitea API route");return enc(a.repo)});
   return target.request(resolved,init);
  };
  const value=Reflect.get(target,key,target);
  return typeof value==="function"?value.bind(target):value;
 }}) as Gitea;
}
export const path=(template:string,a:Record<string,any>)=>template.replace(/\{([^}]+)\}/g,(_m,k:string)=>enc(a[k]));
export function makeTool(name:string,scope:string,access:"read"|"write",description:string,routes:Record<string,Route>,sampleInput:Record<string,unknown>={},special?:(a:any,g:Gitea,meta:Record<string,unknown>)=>Promise<unknown>):ToolDef{
 const methods=Object.keys(routes);
 const methodSchema=name==="issue_write"?z.enum(methods as [string,...string[]]).optional():z.enum(methods as [string,...string[]]).default(methods[0]);
 const schema=z.object({...fields,...(methods.length>1||(methods.length===1&&methods[0]!=="default")?{method:methodSchema}:{})}).passthrough();
 return {name,scope,category:scope,access,description,schema,sampleInput,upstream:[name],extension:false,run:async(a:any,g:Gitea,meta:Record<string,unknown>)=>{
  const args={...a};
  if(name==="issue_write"){
   const issueIndex=args.index??args.issue_index??args.issue_number;
   if(args.index===undefined&&issueIndex!==undefined)args.index=issueIndex;
   if(args.method===undefined){
    if(issueIndex!==undefined){
     if(typeof args.comment==="string"&&args.comment.length>0)args.method="add_comment";
     else if(["title","body","state","assignees","milestone","due_date"].some(k=>args[k]!==undefined))args.method="update";
     else throw new Error("method is required for issue_write when index is provided without update fields or comment");
    }else args.method="create";
   }
  }
  if(special)return special(args,specialClient(g,args),meta);
  const key=args.method||"default",r=routes[key];if(!r)throw new Error(`Unsupported method '${key}' for ${name}`);
  for(const k of r.required||[])if(args[k]===undefined||args[k]==="")throw new Error(`${k} is required for ${name}.${key}`);
  const p=path(r.path,args);
  if(r.method==="GET"){const q=new URLSearchParams();for(const k of r.query||[])if(args[k]!==undefined&&args[k]!==null&&args[k]!=="")q.set(k,Array.isArray(args[k])?args[k].join(","):String(args[k]));return r.raw?g.requestText(p+(q.size?"?"+q:"")):g.request(p+(q.size?"?"+q:""));}
  const b=r.body?.length?Object.fromEntries(r.body.filter(k=>args[k]!==undefined).map(k=>[k,args[k]])):undefined;
  return g.request(p,{method:r.method,...(b?{body:JSON.stringify(b)}:{})});
 }};
}
export const GET=(path:string,query?:string[],required?:string[],raw=false):Route=>({method:"GET",path,query,required,raw});
export const POST=(path:string,body?:string[],required?:string[]):Route=>({method:"POST",path,body,required});
export const PUT=(path:string,body?:string[],required?:string[]):Route=>({method:"PUT",path,body,required});
export const PATCH=(path:string,body?:string[],required?:string[]):Route=>({method:"PATCH",path,body,required});
export const DELETE=(path:string,body?:string[],required?:string[]):Route=>({method:"DELETE",path,body,required});
