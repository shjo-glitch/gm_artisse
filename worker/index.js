function javascriptString(value) {
  return JSON.stringify(String(value ?? ""))
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}

function runtimeConfig(env) {
  return [
    `const SUPABASE_URL = ${javascriptString(env.SUPABASE_URL)};`,
    `const SUPABASE_ANON_KEY = ${javascriptString(env.SUPABASE_ANON_KEY)};`,
    `const ADMIN_PASSWORD = ${javascriptString(env.ADMIN_PASSWORD)};`,
    "",
  ].join("\n");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/supabase-config.js") {
      return new Response(runtimeConfig(env), {
        headers: {
          "cache-control": "no-store",
          "content-type": "text/javascript; charset=utf-8",
          "x-content-type-options": "nosniff",
        },
      });
    }

    if (url.pathname === "/") {
      url.pathname = "/index.html";
      return env.ASSETS.fetch(new Request(url, request));
    }

    return env.ASSETS.fetch(request);
  },
};
