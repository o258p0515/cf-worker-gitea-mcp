import type { Env } from "../env";
import { sign, verify, equal } from "./token";

const json = (value: unknown, status = 200) => Response.json(value, { status });
const validRedirect = (value: string) => {
  try {
    const url = new URL(value);
    return Boolean(url.protocol && url.host);
  } catch {
    return false;
  }
};
const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function handleOAuth(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  const issuer = `https://${env.CF_DOMAIN}`;

  if (path === "/.well-known/oauth-protected-resource" || path === "/.well-known/oauth-protected-resource/mcp") {
    return json({
      resource: issuer + "/mcp",
      authorization_servers: [issuer],
      bearer_methods_supported: ["header"],
      scopes_supported: ["mcp:read", "mcp:write"],
    });
  }

  if (path === "/.well-known/oauth-authorization-server") {
    return json({
      issuer,
      authorization_endpoint: issuer + "/oauth/authorize",
      token_endpoint: issuer + "/oauth/token",
      registration_endpoint: issuer + "/oauth/register",
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "client_credentials", "refresh_token"],
      code_challenge_methods_supported: ["S256", "plain"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    });
  }

  if (path === "/oauth/register" && request.method === "POST") {
    const body: any = await request.json();
    const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
    if (!redirectUris.every((item: unknown) => typeof item === "string" && validRedirect(item))) {
      return json({ error: "invalid_redirect_uri" }, 400);
    }
    return json({
      client_id: env.MCP_OAUTH_CLIENT_ID,
      client_secret: env.MCP_OAUTH_CLIENT_SECRET,
      redirect_uris: redirectUris,
      token_endpoint_auth_method: "client_secret_post",
    }, 201);
  }

  if (path === "/oauth/authorize" && (request.method === "GET" || request.method === "POST")) {
    let body: any;
    if (request.method === "GET") {
      body = Object.fromEntries(url.searchParams);
    } else {
      const contentType = request.headers.get("Content-Type") || "";
      if (contentType.includes("application/json")) {
        body = await request.json();
      } else {
        body = Object.fromEntries(await request.formData());
      }
    }

    const redirectUri = String(body.redirect_uri || "");
    if (!validRedirect(redirectUri)) return json({ error: "invalid_redirect_uri" }, 400);
    if (body.response_type && body.response_type !== "code") {
      return json({ error: "unsupported_response_type" }, 400);
    }
    const challengeMethod = String(body.code_challenge_method || "plain");
    if (body.code_challenge && !["S256", "plain"].includes(challengeMethod)) {
      return json({ error: "invalid_code_challenge_method" }, 400);
    }

    if (request.method === "GET" && !body.approve) {
      const hiddenFields = [
        ["redirect_uri", redirectUri],
        ["client_id", String(body.client_id || "")],
        ["response_type", String(body.response_type || "code")],
        ["state", String(body.state || "")],
        ["code_challenge", String(body.code_challenge || "")],
        ["code_challenge_method", challengeMethod],
      ];
      const hidden = hiddenFields
        .filter(([, value]) => value !== "")
        .map(([name, value]) => `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`)
        .join("");
      const html = `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Authorize Gitea MCP</title><body><main><h1>Authorize Gitea MCP</h1><p>Nhập MCP API passphrase để cấp quyền truy cập.</p><form method="post" action="/oauth/authorize">${hidden}<label>Passphrase <input name="passphrase" type="password" autocomplete="current-password" required></label><button type="submit" name="approve" value="1">Approve</button></form></main></body></html>`;
      return new Response(html, {
        headers: {
          "Content-Type": "text/html;charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    if (!equal(String(body.passphrase || ""), env.MCP_API_PASSPHRASE)) {
      return json({ error: "approval_required" }, 401);
    }

    const code = await sign({
      typ: "code",
      client_id: body.client_id || env.MCP_OAUTH_CLIENT_ID,
      redirect_uri: redirectUri,
      challenge: body.code_challenge || "",
      method: challengeMethod,
      exp: Math.floor(Date.now() / 1000) + 300,
    }, env.MCP_API_PASSPHRASE);

    const destination = new URL(redirectUri);
    destination.searchParams.set("code", code);
    if (body.state) destination.searchParams.set("state", String(body.state));

    // Construct Location directly so custom application schemes (cursor://, vscode://, etc.)
    // are not rejected by Response.redirect's URL handling.
    return new Response(null, {
      status: 302,
      headers: {
        Location: destination.toString(),
        "Cache-Control": "no-store",
        "Pragma": "no-cache",
      },
    });
  }

  if (path === "/oauth/token" && request.method === "POST") {
    let body: any = {};
    const contentType = request.headers.get("Content-Type") || "";
    try {
      body = contentType.includes("json")
        ? await request.json()
        : Object.fromEntries(new URLSearchParams(await request.text()));
    } catch {
      return json({ error: "invalid_request" }, 400);
    }

    const authorization = request.headers.get("Authorization") || "";
    if (authorization.startsWith("Basic ")) {
      try {
        const credentials = atob(authorization.slice(6));
        const separator = credentials.indexOf(":");
        body.client_id = credentials.slice(0, separator);
        body.client_secret = credentials.slice(separator + 1);
      } catch {
        return json({ error: "invalid_client" }, 401);
      }
    }

    let payload: any;
    const grant = String(body.grant_type || "");
    if (grant === "client_credentials") {
      if (!equal(String(body.client_id || ""), env.MCP_OAUTH_CLIENT_ID) ||
          !equal(String(body.client_secret || ""), env.MCP_OAUTH_CLIENT_SECRET)) {
        return json({ error: "invalid_client" }, 401);
      }
      payload = { sub: body.client_id };
    } else if (grant === "authorization_code") {
      payload = await verify(String(body.code || ""), env.MCP_API_PASSPHRASE);
      if (!payload || payload.typ !== "code" || payload.redirect_uri !== body.redirect_uri) {
        return json({ error: "invalid_grant" }, 400);
      }
      if (payload.challenge) {
        const digest = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(String(body.code_verifier || "")),
        );
        const encoded = btoa(String.fromCharCode(...new Uint8Array(digest)))
          .replace(/=/g, "")
          .replace(/\\+/g, "-")
          .replace(/\\//g, "_");
        const verifier = String(body.code_verifier || "");
        if (payload.method === "S256" ? encoded !== payload.challenge : verifier !== payload.challenge) {
          return json({ error: "invalid_grant" }, 400);
        }
      }
    } else if (grant === "refresh_token") {
      payload = await verify(String(body.refresh_token || ""), env.MCP_API_PASSPHRASE);
      if (!payload || payload.typ !== "refresh") return json({ error: "invalid_grant" }, 400);
    } else {
      return json({ error: "unsupported_grant_type" }, 400);
    }

    const now = Math.floor(Date.now() / 1000);
    const subject = payload.sub || env.MCP_OAUTH_CLIENT_ID;
    return json({
      access_token: await sign({ typ: "access", sub: subject, exp: now + 86400 }, env.MCP_API_PASSPHRASE),
      token_type: "Bearer",
      expires_in: 86400,
      refresh_token: await sign({ typ: "refresh", sub: subject, exp: now + 2592000 }, env.MCP_API_PASSPHRASE),
      scope: "mcp:read mcp:write",
    });
  }

  return null;
}

export async function oauth(request: Request, env: Env): Promise<Response | null> {
  try {
    return await handleOAuth(request, env);
  } catch (error) {
    console.error("OAuth handler exception", error instanceof Error ? error.stack || error.message : String(error));
    return json({ error: "oauth_internal_error" }, 500);
  }
}
