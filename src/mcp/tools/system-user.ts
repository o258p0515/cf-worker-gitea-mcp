import { makeTool,GET,POST } from "../tool-runtime";
import { BUILD_VERSION,DEPLOYED_AT_VN } from "../../generated-version";
export const systemUserTools=[
makeTool("get_gitea_mcp_server_version","version","read","Get Worker version, deployment timestamp, domain, Gitea host and active tool count",{default:GET("/version")},{},async(_a,_g,meta)=>({version:BUILD_VERSION,deployedAtVN:DEPLOYED_AT_VN,...meta})),
makeTool("get_me","user","read","Get the authenticated Gitea user",{default:GET("/user")}),
makeTool("get_user_orgs","user","read","List organizations for the authenticated user",{default:GET("/user/orgs",["page","limit"])},{page:1,limit:30}),
makeTool("create_organization","user","write","Create a Gitea organization",{default:POST("/orgs",["username","full_name","description","visibility","website"],["username"])},{username:"mcp-test-org",full_name:"MCP Test Organization"}),
makeTool("search_users","search","read","Search Gitea users",{default:GET("/users/search",["q","page","limit"],["q"])},{q:""}),
makeTool("search_org_teams","search","read","Search teams in an organization",{default:GET("/orgs/{org}/teams/search",["q","page","limit"],["org"])},{org:"",q:""}),
makeTool("search_repos","search","read","Search repositories by query, UID or topic",{default:GET("/repos/search",["q","uid","topic","page","limit"])},{q:""}),
makeTool("search_issues","search","read","Search issues and pull requests across Gitea",{default:GET("/repos/issues/search",["q","state","labels","owner","type","page","limit"])},{q:""})
];
