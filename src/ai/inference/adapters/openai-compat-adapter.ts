// KhanhOS AI — OpenAI-compatible adapter
// Supports local gateways and the Cerebras Cloud OpenAI-compatible API.

import type {
  ChatCompletionMessage,
  GenerationOptions,
  InferenceChunk,
  InferenceUsage,
  LocalModelInfo,
  ModelAdapter,
} from "@/ai/core/types";
import {
  getAIRuntimeConfig,
  isCerebrasUrl,
  isLocalRuntimeUrl,
} from "@/ai/core/config";

interface OAIGeneratedMessage {
  role: string;
  content?: string;
}

interface OAIChatResponse {
  choices?: Array<{
    message?: OAIGeneratedMessage;
    delta?: { content?: string };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

async function runtimeError(response: Response): Promise<Error> {
  let detail = "";
  try {
    const body = (await response.json()) as OAIChatResponse;
    detail = body.error?.message ?? "";
  } catch {
    // Some gateway errors have an empty response body.
  }
  if (response.status === 402 && thisIsCerebrasRequest(response.url)) {
    return new Error(
      "Cerebras từ chối yêu cầu (HTTP 402): tài khoản hoặc API key hiện không có hạn mức sử dụng. Kiểm tra Billing/Usage trong Cerebras Cloud."
    );
  }
  return new Error(`Runtime HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
}

function thisIsCerebrasRequest(url: string): boolean {
  return url.includes("api.cerebras.ai");
}

export class OpenAICompatAdapter implements ModelAdapter {
  readonly name = "openai-compat";
  private readonly base: string;
  private readonly model: string;
  private readonly mode: "openai-compat" | "cerebras" | "openrouter";

  constructor(
    baseUrl?: string,
    model?: string,
    mode?: "openai-compat" | "cerebras" | "openrouter"
  ) {
    const cfg = getAIRuntimeConfig();
    this.mode =
      mode ??
      (cfg.mode === "cerebras" || cfg.mode === "openrouter"
        ? cfg.mode
        : "openai-compat");
    this.base = (
      baseUrl ??
      (this.mode === "cerebras"
        ? cfg.cerebrasBaseUrl
        : this.mode === "openrouter"
          ? cfg.openrouterBaseUrl
          : cfg.openaiCompatBaseUrl)
    ).replace(/\/$/, "");
    this.model = model ?? cfg.defaultModel;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const key =
      this.mode === "cerebras"
        ? getAIRuntimeConfig().cerebrasApiKey
        : this.mode === "openrouter"
          ? getAIRuntimeConfig().openrouterApiKey
        : process.env.OPENAI_COMPAT_API_KEY;
    if (key) headers.Authorization = `Bearer ${key}`;
    if (this.mode === "openrouter") {
      headers["HTTP-Referer"] = "http://localhost:3000";
      headers["X-Title"] = "KhanhOS AI";
    }
    return headers;
  }

  private guard(): void {
    const allowed =
      this.mode === "cerebras"
        ? isCerebrasUrl(this.base)
        : this.mode === "openrouter"
          ? new URL(this.base).hostname === "openrouter.ai"
          : isLocalRuntimeUrl(this.base);
    if (!allowed) {
      throw new Error(`Bảo mật: từ chối endpoint ngoài (${this.base}).`);
    }
    if (this.mode === "cerebras" && !getAIRuntimeConfig().cerebrasApiKey) {
      throw new Error("CEREBRAS_API_KEY chưa được cấu hình.");
    }
    if (this.mode === "openrouter" && !getAIRuntimeConfig().openrouterApiKey) {
      throw new Error("OPENROUTER_API_KEY chưa được cấu hình.");
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      this.guard();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(`${this.base}/v1/models`, {
        headers: this.headers(),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<LocalModelInfo[]> {
    this.guard();
    const response = await fetch(`${this.base}/v1/models`, { headers: this.headers() });
    if (!response.ok) return [];
    const data = (await response.json()) as { data?: Array<{ id?: string }> };
    const models = (data.data ?? [])
      .filter((item) => item.id)
      .map((item) => ({
        id: `runtime:${item.id}`,
        runtimeName: item.id as string,
        provider: this.mode,
        capabilities: {
          chat: true,
          tools: this.mode === "openai-compat",
          vision: false,
          streaming: true,
          contextLength: getAIRuntimeConfig().defaultContextLength,
        },
      }));
    if (this.mode === "openrouter" && !models.some((item) => item.runtimeName === this.model)) {
      models.unshift({
        id: `runtime:${this.model}`,
        runtimeName: this.model,
        provider: this.mode,
        capabilities: {
          chat: true,
          tools: false,
          vision: false,
          streaming: true,
          contextLength: getAIRuntimeConfig().defaultContextLength,
        },
      });
    }
    return models;
  }

  async getDefaultModel(): Promise<LocalModelInfo | null> {
    const models = await this.listModels();
    return models.find((item) => item.runtimeName === this.model) ?? models[0] ?? null;
  }

  async supportsTools(_model: string): Promise<boolean> {
    return this.mode !== "cerebras";
  }

  async supportsVision(_model: string): Promise<boolean> {
    return false;
  }

  async generate(
    messages: ChatCompletionMessage[],
    model: string,
    options: GenerationOptions = {}
  ): Promise<string> {
    this.guard();
    const response = await fetch(`${this.base}/v1/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      signal: options.signal,
      body: JSON.stringify({
        model,
        messages: messages.map((message) => ({ role: message.role, content: message.content })),
        stream: false,
        temperature: options.temperature,
        top_p: options.topP,
        max_tokens: options.maxOutputTokens,
        stop: options.stopSequences,
        ...(options.format === "json" ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!response.ok) throw await runtimeError(response);
    const data = (await response.json()) as OAIChatResponse;
    if (data.error) throw new Error(data.error.message ?? "Runtime error");
    return data.choices?.[0]?.message?.content ?? "";
  }

  async stream(
    messages: ChatCompletionMessage[],
    model: string,
    options: GenerationOptions,
    onChunk: (chunk: InferenceChunk) => void
  ): Promise<InferenceUsage> {
    this.guard();
    const response = await fetch(`${this.base}/v1/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      signal: options.signal,
      body: JSON.stringify({
        model,
        messages: messages.map((message) => ({ role: message.role, content: message.content })),
        stream: true,
        stream_options: { include_usage: true },
        temperature: options.temperature,
        top_p: options.topP,
        max_tokens: options.maxOutputTokens,
        stop: options.stopSequences,
      }),
    });
    if (!response.ok) throw await runtimeError(response);
    if (!response.body) throw new Error("Runtime không trả về stream.");

    let usage: InferenceUsage = { promptTokens: 0, outputTokens: 0, estimated: true };
    let outputLength = 0;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const event = JSON.parse(payload) as OAIChatResponse;
          const delta = event.choices?.[0]?.delta?.content ?? "";
          if (delta) outputLength += delta.length;
          const finish = event.choices?.[0]?.finish_reason;
          onChunk({
            delta,
            finishReason: finish === "length" ? "length" : finish === "stop" ? "stop" : null,
          });
          if (event.usage) {
            usage = {
              promptTokens: event.usage.prompt_tokens ?? 0,
              outputTokens: event.usage.completion_tokens ?? 0,
              estimated: false,
            };
          }
        } catch {
          continue;
        }
      }
    }
    if (usage.estimated) {
      usage = { promptTokens: 0, outputTokens: Math.round(outputLength / 4), estimated: true };
    }
    return usage;
  }

  async generateStructured<T = unknown>(
    messages: ChatCompletionMessage[],
    model: string,
    _schemaHint: string,
    options: GenerationOptions = {}
  ): Promise<T | null> {
    const text = await this.generate(messages, model, { ...options, format: "json" });
    try {
      return JSON.parse(text) as T;
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return null;
      try {
        return JSON.parse(match[0]) as T;
      } catch {
        return null;
      }
    }
  }
}
