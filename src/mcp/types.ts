import type {z} from "zod";
import type {Gitea} from "../gitea/client";
export type ToolDef={name:string;scope:string;category:string;access:"read"|"write";description:string;schema:z.ZodTypeAny;sampleInput:Record<string,unknown>;upstream:string[];extension?:boolean;run:(args:any,gitea:Gitea,meta:Record<string,unknown>)=>Promise<unknown>};
