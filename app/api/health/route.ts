import { env } from "cloudflare:workers";
import { requireAuthenticatedOwner, withDeviceCookie } from "@/lib/device-owner";

type HealthState = "ready" | "not_configured" | "unknown";

function state(ok: boolean): HealthState {
  return ok ? "ready" : "not_configured";
}

export async function GET(request: Request) {
  const required = await requireAuthenticatedOwner(request);
  if (required.response) return required.response;
  const runtimeEnv = env as unknown as Record<string, unknown>;
  const relayConfigured = Boolean(String(runtimeEnv.DEEPSEEK_RELAY_URL ?? "").trim() && String(runtimeEnv.DEEPSEEK_RELAY_TOKEN ?? "").trim());
  const officialConfigured = Boolean(String(runtimeEnv.DEEPSEEK_API_KEY ?? "").trim());
  const snapshot = {
    generatedAt: new Date().toISOString(),
    checks: [
      { key: "database", label: "账号与持仓库", state: state(Boolean(runtimeEnv.DB)), detail: runtimeEnv.DB ? "D1 绑定已注入；请求时按账号隔离" : "未配置 D1 绑定 DB" },
      { key: "market", label: "行情适配层", state: "unknown" as const, detail: "由最近一次行情请求返回主源、备用源和覆盖范围" },
      { key: "news", label: "资讯聚合", state: "unknown" as const, detail: "由最近一次资讯请求返回来源和发布时间" },
      { key: "ai", label: "AI 联合研判", state: state(relayConfigured || officialConfigured), detail: relayConfigured ? "安全中转已配置" : officialConfigured ? "AI 服务已配置" : "AI 分析服务尚未配置" },
    ],
    note: "unknown 表示尚未发起该类上游请求，不等于服务故障。",
  };
  return withDeviceCookie(Response.json(snapshot, { headers: { "Cache-Control": "private, no-store" } }), required.owner.setCookie);
}
