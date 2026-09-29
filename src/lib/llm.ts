import OpenAI from "openai";
import type { ChatCompletionContentPart, ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { z } from "zod";

export const MODELS = {
  vision: process.env.MODEL_VISION || "qwen/qwen3.8-27b",
  smart: process.env.MODEL_SMART || "openai/gpt-oss-120b",
  smartB: process.env.MODEL_SMART_B || "openai/gpt-oss-120b",
  fast: process.env.MODEL_FAST || "openai/gpt-oss-20b",
  // Second date-turn model so each side of a date uses its own token budget (Groq limits are per model).
  fastB: process.env.MODEL_FAST_B || "qwen/qwen3.6-27b",
  fastC: process.env.MODEL_FAST_C || "qwen/qwen3.8-27b",
};

let client: OpenAI | null = null;
function llm() {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1",
      maxRetries: 2,
      timeout: 60_000,
    });
  }
  return client;
}

function modelParams(model: string): Record<string, unknown> {
  if (model.startsWith("openai/gpt-oss")) return { reasoning_effort: "low" };
  if (model.startsWith("qwen/")) return { reasoning_format: "hidden", reasoning_effort: "none" };
  return {};
}

const TEXT_FALLBACKS = ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b", "qwen/qwen3.6-27b"];
const VISION_FALLBACKS = ["qwen/qwen3.8-27b", "qwen/qwen3.6-27b"];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One completion with rate-limit resilience: waits out short 429s on the requested model,
 * then falls back to other models (Groq token limits are per model).
 */
async function complete(params: Omit<OpenAI.Chat.ChatCompletionCreateParamsNonStreaming, "model"> & { model: string }, vision = false) {
  const chain = [params.model, ...(vision ? VISION_FALLBACKS : TEXT_FALLBACKS).filter((m) => m !== params.model)];
  let lastErr: unknown;
  for (const model of chain) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await llm().chat.completions.create({ ...params, model, ...modelParams(model) } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming);
      } catch (e) {
        lastErr = e;
        const err = e as { status?: number; message?: string };
        // gpt-oss occasionally emits a stray tool call (400 "Tool choice is none") or bad JSON output; a retry usually succeeds.
        const flaky = err.status === 400 && /tool|failed_generation|json_validate/i.test(err.message ?? "");
        if (flaky) {
          if (attempt >= 1) break;
          continue;
        }
        if (err.status !== 429 && !(err.status && err.status >= 500)) throw e;
        const m = err.message?.match(/try again in ([\d.]+)(ms|s)/);
        const wait = m ? Number(m[1]) * (m[2] === "s" ? 1000 : 1) : 1000;
        await sleep(Math.min(Math.max(wait, 800) * (attempt + 1), 8000));
      }
    }
  }
  throw lastErr;
}

function stripThinking(text: string) {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

type UserContent = string | ChatCompletionContentPart[];

export async function chatText(opts: {
  model: string;
  system: string;
  messages: ChatCompletionMessageParam[];
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await complete({
      model: opts.model,
      temperature: opts.temperature ?? 0.9,
      max_completion_tokens: (opts.maxTokens ?? 400) * (attempt + 1),
      messages: [{ role: "system", content: opts.system }, ...opts.messages],
    });
    const text = stripThinking(res.choices[0]?.message?.content ?? "");
    if (text && res.choices[0]?.finish_reason !== "length") return text;
    if (text && attempt === 2) return text;
  }
  throw new Error(`Empty completion from ${opts.model}`);
}

export async function chatJSON<T>(opts: {
  model: string;
  system: string;
  user: UserContent;
  schema: z.ZodType<T>;
  temperature?: number;
  maxTokens?: number;
}): Promise<T> {
  const jsonSchema = JSON.stringify(z.toJSONSchema(opts.schema));
  const system = `${opts.system}\n\nRespond with ONLY a JSON object that matches this JSON Schema:\n${jsonSchema}`;
  const messages: ChatCompletionMessageParam[] = [{ role: "user", content: opts.user } as ChatCompletionMessageParam];
  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await complete({
      model: opts.model,
      temperature: opts.temperature ?? 0.4,
      max_completion_tokens: opts.maxTokens ?? 4000,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, ...messages],
    }, typeof opts.user !== "string");
    const text = stripThinking(res.choices[0]?.message?.content ?? "");
    try {
      const parsed = opts.schema.safeParse(JSON.parse(text));
      if (parsed.success) return parsed.data;
      lastErr = parsed.error.message.slice(0, 1500);
    } catch (e) {
      lastErr = `Invalid JSON: ${(e as Error).message}`;
    }
    messages.push(
      { role: "assistant", content: text.slice(0, 6000) },
      { role: "user", content: `That did not match the schema. Fix these problems and return the full corrected JSON only:\n${lastErr}` },
    );
  }
  throw new Error(`LLM JSON validation failed: ${lastErr}`);
}
