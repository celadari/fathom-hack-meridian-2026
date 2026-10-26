// Fathom demo API: forwards /demo/* and /healthz to the demo server on the VM through
// Workers VPC (binding DEMO → Cloudflare Tunnel → 10.10.0.10:8787). The server enforces the
// demo token, rate limits and CORS (Pages URL only); the visitor's IP is passed on for rate limits.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!(url.pathname.startsWith("/demo/") || url.pathname === "/healthz")) {
      return new Response("not found", { status: 404 });
    }
    const headers = new Headers(request.headers);
    headers.set("x-forwarded-for", request.headers.get("cf-connecting-ip") ?? "");
    try {
      return await env.DEMO.fetch(new Request(`http://fathom-demo${url.pathname}${url.search}`, {
        method: request.method,
        headers,
        body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      }));
    } catch (e) {
      return new Response(JSON.stringify({ error: `demo server unreachable: ${e.message}` }), {
        status: 502,
        headers: { "content-type": "application/json" },
      });
    }
  },
};
