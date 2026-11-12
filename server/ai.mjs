// 새메뉴 자동 반영(lib/season-sync.js)이 쓰는 env.AI.run(model, inputs)를 Cloudflare 밖에서 흉내 낸다.
// - CF_ACCOUNT_ID + CF_API_TOKEN: Cloudflare Workers AI REST API (운영과 같은 모델)
// - AI_BASE_URL (+ AI_MODEL, AI_API_KEY): OpenAI 호환 /chat/completions (사내 LLM, Ollama 등. 이미지를 읽는 모델이어야 한다)
// 둘 다 없으면 undefined를 돌려주고, 관리자 화면의 "지금 확인"은 "AI가 연결되지 않았습니다"로 막힌다.
export function createAI(env) {
  if (env.CF_ACCOUNT_ID && env.CF_API_TOKEN) {
    return {
      provider: "cloudflare",
      async run(model, inputs) {
        const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CF_ACCOUNT_ID)}/ai/run/${model}`, {
          method: "POST",
          headers: { authorization: `Bearer ${env.CF_API_TOKEN}`, "content-type": "application/json" },
          body: JSON.stringify(inputs),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success === false) throw new Error(`Workers AI 오류 (${res.status}) ${data.errors?.[0]?.message || ""}`.trim());
        return data.result;
      },
    };
  }
  if (env.AI_BASE_URL) {
    return {
      provider: "openai-compatible",
      async run(model, inputs) {
        const res = await fetch(`${env.AI_BASE_URL.replace(/\/+$/, "")}/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json", ...(env.AI_API_KEY ? { authorization: `Bearer ${env.AI_API_KEY}` } : {}) },
          body: JSON.stringify({ ...inputs, model: env.AI_MODEL || model }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`AI 서버 오류 (${res.status}) ${data.error?.message || ""}`.trim());
        return data;
      },
    };
  }
  return undefined;
}
