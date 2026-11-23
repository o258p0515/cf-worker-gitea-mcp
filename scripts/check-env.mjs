import {mask} from "./mask.mjs";
const required=["CF_DOMAIN","CF_API_EMAIL","CF_API_KEY","GITEA_HOST","GITEA_ACCESS_TOKEN","SWAGGER_USERNAME","SWAGGER_PASSWORD","MCP_TOKEN","MCP_API_PASSPHRASE","MCP_OAUTH_CLIENT_ID","MCP_OAUTH_CLIENT_SECRET"];
const optional=["CLOUDFLARE_ACCOUNT_ID","GITEA_EXTRA_HEADERS","GITEA_DEFAULT_OWNER","GITEA_DEFAULT_REPO","MCP_OAUTH_REDIRECT_URIS"];
let fail=false;
const rows=[...required,...optional].map(k=>{const v=process.env[k]||"",must=required.includes(k);if(!v&&must)fail=true;return {key:k,status:v?"PASS":must?"MISSING (BẮT BUỘC)":"MISSING (TÙY CHỌN)",masked:v?mask(v)+" ("+v.length+" ký tự)":""}});
const table=["| Key | Status | Masked value |","|---|---|---|",...rows.map(x=>"| "+x.key+" | "+x.status+" | "+x.masked+" |")].join("\n");
console.log(table);
if(process.env.GITHUB_STEP_SUMMARY)await import("node:fs/promises").then(fs=>fs.appendFile(process.env.GITHUB_STEP_SUMMARY,table+"\n"));
if(fail){console.error("ENV CHECK FAILED - THIẾU BIẾN MÔI TRƯỜNG BẮT BUỘC");process.exit(1)}
console.log("ENV CHECK PASSED");
