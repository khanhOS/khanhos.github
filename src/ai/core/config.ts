// Runtime configuration for local inference and Cerebras Cloud.

export interface AIRuntimeConfig {
  /** auto | ollama | openai-compat | cerebras | openrouter | none */
  mode: string;
  ollamaBaseUrl: string;
  openaiCompatBaseUrl: string;
  cerebrasBaseUrl: string;
  cerebrasApiKey: string;
  openrouterBaseUrl: string;
  openrouterApiKey: string;
  defaultModel: string;
  defaultContextLength: number;
  probeCacheMs: number;
  maxContextBudgetTokens: number;
}

function env(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

export function getAIRuntimeConfig(): AIRuntimeConfig {
  return {
    mode: env("AI_RUNTIME", "auto"),
    ollamaBaseUrl: env("OLLAMA_BASE_URL", "http://127.0.0.1:11434"),
    openaiCompatBaseUrl: env("OPENAI_COMPAT_BASE_URL", "http://127.0.0.1:8080"),
    cerebrasBaseUrl: env("CEREBRAS_BASE_URL", "https://api.cerebras.ai"),
    cerebrasApiKey: env("CEREBRAS_API_KEY", ""),
    openrouterBaseUrl: env("OPENROUTER_BASE_URL", "https://openrouter.ai/api"),
    openrouterApiKey: env("OPENROUTER_API_KEY", ""),
    defaultModel: env("AI_MODEL", "qwen2.5:0.5b"),
    defaultContextLength: Number(env("AI_NUM_CTX", "4096")),
    probeCacheMs: Number(env("AI_PROBE_CACHE_MS", "15000")),
    maxContextBudgetTokens: Number(env("AI_MAX_CONTEXT_TOKENS", "3000")),
  };
}

/** Reject external endpoints unless explicitly allowed for local runtimes. */
export function isLocalRuntimeUrl(url: string): boolean {
  if (process.env.AI_ALLOW_REMOTE === "true") return true;
  try {
    const hostname = new URL(url).hostname;
    return ["127.0.0.1", "localhost", "0.0.0.0", "[::1]", "::1"].includes(hostname);
  } catch {
    return false;
  }
}

export function isCerebrasUrl(url: string): boolean {
  try {
    return new URL(url).hostname === "api.cerebras.ai";
  } catch {
    return false;
  }
}
