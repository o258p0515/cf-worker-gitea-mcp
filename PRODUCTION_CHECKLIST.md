# V2 Production Acceptance Checklist — Gitea MCP Worker
Repository: o258p0515/cf-worker-gitea-mcp
Production URL: https://giteao258p0515.dpdns.org

## Implementation and CI
- [x] Six business modules and shared 48-tool registry.
- [x] Unique 48 tool names; schemas, descriptions and samples.
- [x] Filter union across scopes and named tools, followed by read-only enforcement.
- [x] Same active set for MCP and API; disabled API execution returns 403.
- [x] Playground search, scope/access filters and active count.
- [x] Playground writes require confirmation and a dedicated fixture.
- [x] Four-column environment gate and Worker secret sync.
- [ ] V2 branch Actions validation PASS.
- [ ] Main deployment workflow PASS.

## Production inventory
| # | Tool | Scope | Access | MCP | API |
|---:|---|---|---|---|---|
| 1 | get_gitea_mcp_server_version | version | read | [ ] | [ ] |
| 2 | get_me | user | read | [ ] | [ ] |
| 3 | get_user_orgs | user | read | [ ] | [ ] |
| 4 | create_organization | user | write | [ ] | [ ] |
| 5 | search_users | search | read | [ ] | [ ] |
| 6 | search_org_teams | search | read | [ ] | [ ] |
| 7 | search_repos | search | read | [ ] | [ ] |
| 8 | search_issues | search | read | [ ] | [ ] |
| 9 | notification_read | notification | read | [ ] | [ ] |
| 10 | notification_write | notification | write | [ ] | [ ] |
| 11 | label_read | label | read | [ ] | [ ] |
| 12 | label_write | label | write | [ ] | [ ] |
| 13 | milestone_read | milestone | read | [ ] | [ ] |
| 14 | milestone_write | milestone | write | [ ] | [ ] |
| 15 | wiki_read | wiki | read | [ ] | [ ] |
| 16 | wiki_write | wiki | write | [ ] | [ ] |
| 17 | timetracking_read | timetracking | read | [ ] | [ ] |
| 18 | timetracking_write | timetracking | write | [ ] | [ ] |
| 19 | package_read | package | read | [ ] | [ ] |
| 20 | package_write | package | write | [ ] | [ ] |
| 21 | project_read | project | read | [ ] | [ ] |
| 22 | project_write | project | write | [ ] | [ ] |
| 23 | list_issues | issue | read | [ ] | [ ] |
| 24 | issue_read | issue | read | [ ] | [ ] |
| 25 | issue_write | issue | write | [ ] | [ ] |
| 26 | list_pull_requests | pull_request | read | [ ] | [ ] |
| 27 | pull_request_read | pull_request | read | [ ] | [ ] |
| 28 | pull_request_write | pull_request | write | [ ] | [ ] |
| 29 | pull_request_review_write | pull_request | write | [ ] | [ ] |
| 30 | actions_config_read | actions | read | [ ] | [ ] |
| 31 | actions_config_write | actions | write | [ ] | [ ] |
| 32 | actions_run_read | actions | read | [ ] | [ ] |
| 33 | actions_run_write | actions | write | [ ] | [ ] |
| 34 | repo_read | repository | read | [ ] | [ ] |
| 35 | repo_write | repository | write | [ ] | [ ] |
| 36 | get_repository_tree | repository | read | [ ] | [ ] |
| 37 | get_file_contents | file | read | [ ] | [ ] |
| 38 | get_dir_contents | file | read | [ ] | [ ] |
| 39 | create_or_update_file | file | write | [ ] | [ ] |
| 40 | delete_file | file | write | [ ] | [ ] |
| 41 | branch_read | branch | read | [ ] | [ ] |
| 42 | branch_write | branch | write | [ ] | [ ] |
| 43 | tag_read | tag | read | [ ] | [ ] |
| 44 | tag_write | tag | write | [ ] | [ ] |
| 45 | commit_read | commit | read | [ ] | [ ] |
| 46 | commit_write | commit | write | [ ] | [ ] |
| 47 | release_read | release | read | [ ] | [ ] |
| 48 | release_write | release | write | [ ] | [ ] |

## Production evidence
| Field | Actual result |
|---|---|
| V2 commit SHA | Pending |
| V2 CI run URL | Pending |
| Deploy run URL | Pending |
| Production BUILD_VERSION | Pending |
| MCP tools/list and API meta | Pending |
| T1–T14 | Pending |
