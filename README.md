# Gitea MCP Worker

Stateless Model Context Protocol server for Gitea on Cloudflare Workers. V2 exposes 48 tools across user/search, repositories/files, Git refs/releases, issues/pull requests, Actions and management APIs.

## Endpoints
- POST /mcp — MCP Streamable HTTP endpoint.
- /healthz — Worker version and Gitea connectivity.
- /api — authenticated playground with tool search, scope/access filters and sample payloads.
- /api/meta, /api/samples, /api/execute — authenticated playground API.
- OAuth discovery, DCR, PKCE and token endpoints are provided under /.well-known/* and /oauth/*.

## Required GitHub Actions secrets
CF_DOMAIN, CF_API_EMAIL, CF_API_KEY, GITEA_HOST, GITEA_ACCESS_TOKEN, SWAGGER_USERNAME, SWAGGER_PASSWORD, MCP_TOKEN, MCP_API_PASSPHRASE, MCP_OAUTH_CLIENT_ID, MCP_OAUTH_CLIENT_SECRET.

Optional: GITEA_EXTRA_HEADERS, GITEA_DEFAULT_OWNER, GITEA_DEFAULT_REPO, GITEA_READONLY, GITEA_SCOPES, GITEA_TOOLS, GITEA_TEST_OWNER, GITEA_TEST_REPO, MCP_OAUTH_REDIRECT_URIS. Never commit secrets.

## Tool filters
- Empty GITEA_SCOPES and GITEA_TOOLS: all 48 tools active.
- GITEA_SCOPES=issue,branch: include tools in either scope.
- GITEA_TOOLS=get_me,search_repos: include named tools.
- When both are set, allowlists are combined as a union.
- GITEA_READONLY=true or 1: remove every write tool after allowlist calculation.
- Scopes: version,user,search,notification,label,milestone,wiki,timetracking,package,project,issue,pull_request,actions,repository,file,branch,tag,commit,release.

## Playground safety
/api is protected by SWAGGER_USERNAME and SWAGGER_PASSWORD. Read samples are loaded from Gitea. Playground writes require confirmation=true and a dedicated disposable GITEA_TEST_OWNER plus GITEA_TEST_REPO; calls are redirected to that fixture. MCP write tools remain subject to Gitea token permissions and active tool filters.

## Authentication
MCP accepts OAuth Bearer tokens, static MCP_TOKEN as Bearer or X-API-Key, and Gitea token passthrough (Authorization: token ... or X-Gitea-Token). Protect tokens and the OAuth HMAC passphrase.

## Local validation
Run npm install, npm run typecheck, and npm test. Pushes to v2/** run branch validation; pushes to main deploy and run production acceptance tests T1–T14.
