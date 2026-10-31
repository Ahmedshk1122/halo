import { useEffect, useState } from "react";

export type ServerHealth =
  | { state: "checking" }
  | { state: "offline" }
  | { state: "ok"; provider: "anthropic" | "gemini"; hasKey: boolean; directorModel: string; plannerModel: string };

/** Display name of the model provider the local server is set up for. */
export function aiName(provider: "anthropic" | "gemini" | null | undefined): string {
  return provider === "gemini" ? "Gemini" : "Claude";
}

/** Polls the local API server so the panel can show whether Claude is reachable. */
export function useServerHealth(): ServerHealth {
  const [health, setHealth] = useState<ServerHealth>({ state: "checking" });
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch("/api/health");
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { provider?: "anthropic" | "gemini"; hasKey: boolean; directorModel: string; plannerModel: string };
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
