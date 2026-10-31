import { useEffect, useState } from "react";
import { aiName, type AIProvider } from "../../shared/director";

export { aiName };

export type ServerHealth =
  | { state: "checking" }
  | { state: "offline" }
  | { state: "ok"; provider: AIProvider; hasKey: boolean; directorModel: string; plannerModel: string };

/** Polls the local API server so the panel can show whether the model provider is reachable. */
export function useServerHealth(): ServerHealth {
  const [health, setHealth] = useState<ServerHealth>({ state: "checking" });
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch("/api/health");
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { provider?: AIProvider; hasKey: boolean; directorModel: string; plannerModel: string };
        if (alive) setHealth({ state: "ok", ...body, provider: body.provider ?? "anthropic" });
      } catch {
        if (alive) setHealth({ state: "offline" });
      }
    };
    void check();
    const t = window.setInterval(check, 10_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);
  return health;
}
