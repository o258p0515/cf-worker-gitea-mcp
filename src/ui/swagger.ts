import {BUILD_VERSION} from "../generated-version";

export function loginPage() {
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Gitea MCP Login</title><style>body{font:16px system-ui;background:#101827;color:#e5e7eb;display:grid;place-items:center;min-height:90vh}.card{background:#1f2937;padding:2rem;border-radius:16px;width:min(360px,85vw)}input,button{box-sizing:border-box;width:100%;padding:12px;margin:8px 0;border-radius:8px}button{background:#2563eb;color:white}</style></head><body><form class="card" id="login-form"><h2>Gitea MCP Playground</h2><p>' + BUILD_VERSION + '</p><input name="username" placeholder="Username" required><input name="password" type="password" placeholder="Password" required><button type="submit">Sign in</button><p id="login-error"></p></form><script>document.getElementById("login-form").addEventListener("submit",async function(event){event.preventDefault();try{const response=await fetch("/api/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget)))});if(response.ok){location.reload();return;}document.getElementById("login-error").textContent="Login failed";}catch(error){document.getElementById("login-error").textContent="Login error: "+String(error);}});</script></body></html>';
}

export function playground() {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<title>Gitea MCP Playground</title>
<style>
body{font:14px system-ui;margin:2rem;background:#f8fafc;color:#0f172a}
textarea,pre{background:#e2e8f0;padding:10px;max-width:100%;box-sizing:border-box}
button{padding:8px;cursor:pointer}
section{margin:1rem 0;padding:1rem;background:#fff;border:1px solid #e2e8f0;border-radius:8px}
</style>
</head>
<body>
<h1>Gitea MCP Playground ${BUILD_VERSION}</h1>
<button id="logout" type="button">Logout</button>
<p id="summary" role="status">Loading…</p>
<div id="tools"></div>
<script>
(function () {
  "use strict";
  const summaryEl = document.getElementById("summary");
  const toolsEl = document.getElementById("tools");
  const logoutEl = document.getElementById("logout");

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (char) {
      switch (char) {
        case "&": return "&amp;";
        case "<": return "&lt;";
        case ">": return "&gt;";
        case '"': return "&quot;";
        case "'": return "&#39;";
        default: return char;
      }
    });
  }

  async function runTool(name) {
    const inputEl = document.getElementById("a-" + name);
    const resultEl = document.getElementById("r-" + name);
    if (!inputEl || !resultEl) return;
    resultEl.textContent = "Running…";
    try {
      const response = await fetch("/api/execute", {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({name: name, input: JSON.parse(inputEl.value)})
      });
      const result = await response.json();
      resultEl.textContent = JSON.stringify(result, null, 2);
    } catch (error) {
      resultEl.textContent = "Tool failed: " + String(error);
    }
  }

  async function init() {
    const controller = new AbortController();
    const timeout = setTimeout(function () { controller.abort(); }, 25000);
    try {
      const responses = await Promise.all([
        fetch("/api/meta", {signal: controller.signal}),
        fetch("/api/samples", {signal: controller.signal})
      ]);
      clearTimeout(timeout);
      if (!responses[0].ok || !responses[1].ok) {
        summaryEl.textContent = "Session expired. Please log in again.";
        return;
      }
      const meta = await responses[0].json();
      const samples = await responses[1].json();
      if (!samples.me || !Array.isArray(meta.tools)) {
        throw new Error("Unexpected API response");
      }
      summaryEl.textContent = "Connected as " + samples.me.login + " · " + meta.tools.length + " tools";
      toolsEl.innerHTML = meta.tools.map(function (tool) {
        const name = escapeHtml(tool.name);
        const description = escapeHtml(tool.description);
        const access = escapeHtml(tool.access);
        const input = escapeHtml(JSON.stringify(samples.inputs[tool.name] || {}, null, 2));
        return '<section><h3>' + name + ' · ' + access + '</h3><p>' + description +
          '</p><textarea id="a-' + name + '" rows="5" cols="75" spellcheck="false">' + input +
          '</textarea><br><button type="button" data-run="' + name + '">Run</button><pre id="r-' +
          name + '"></pre></section>';
      }).join("");
      toolsEl.querySelectorAll("button[data-run]").forEach(function (button) {
        button.addEventListener("click", function () { runTool(button.dataset.run); });
      });
    } catch (error) {
      clearTimeout(timeout);
      summaryEl.textContent = "Playground load failed: " + (error && error.message ? error.message : String(error));
    }
  }

  logoutEl.addEventListener("click", async function () {
    try { await fetch("/api/logout", {method: "POST"}); } finally { location.reload(); }
  });
  init();
})();
</script>
</body>
</html>`;
}
