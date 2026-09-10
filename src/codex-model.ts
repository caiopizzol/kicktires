import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
} from "@ai-sdk/provider";
import { codexResponse } from "./codex.ts";

const proposalSchema = z
  .object({
    toolCalls: z
      .array(
        z
          .object({ name: z.string(), input: z.string().describe("JSON-encoded tool arguments") })
          .strict(),
      )
      .max(20),
    text: z.string().describe("Final response, or empty when proposing tool calls"),
  })
  .strict();

export function proposedResponse(
  text: string,
  options: LanguageModelV4CallOptions,
): LanguageModelV4GenerateResult {
  const proposal = proposalSchema.parse(JSON.parse(text));
  if (proposal.toolCalls.length && proposal.text)
    throw new Error("Codex returned both tool calls and a final response");
  if (options.toolChoice?.type === "required" && !proposal.toolCalls.length)
    throw new Error("Codex omitted a required tool call");
  const content: LanguageModelV4GenerateResult["content"] = proposal.toolCalls.map((call) => {
    const tool = options.tools?.find((tool) => tool.type === "function" && tool.name === call.name);
    if (!tool || tool.type !== "function" || options.toolChoice?.type === "none")
      throw new Error(`Codex proposed an unavailable tool: ${call.name}`);
    if (options.toolChoice?.type === "tool" && options.toolChoice.toolName !== call.name)
      throw new Error("Codex did not select the required tool");
    const input = JSON.parse(call.input);
    z.fromJSONSchema(tool.inputSchema).parse(input);
    return {
      type: "tool-call",
      toolCallId: randomUUID(),
      toolName: call.name,
      input: JSON.stringify(input),
    };
  });
  if (!content.length) {
    if (options.responseFormat?.type === "json" && options.responseFormat.schema)
      z.fromJSONSchema(options.responseFormat.schema).parse(JSON.parse(proposal.text));
    content.push({ type: "text", text: proposal.text });
  }
  return {
    content,
    finishReason: { unified: proposal.toolCalls.length ? "tool-calls" : "stop", raw: undefined },
    usage: {
      inputTokens: {
        total: undefined,
        noCache: undefined,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: { total: undefined, text: undefined, reasoning: undefined },
    },
    warnings: [],
  };
}

export function codexModel(model: string, home: string, respond = codexResponse): LanguageModelV4 {
  async function generate(options: LanguageModelV4CallOptions) {
    const cli = process.env.KICKTIRES_CODEX_CLI;
    if (!cli) throw new Error("Codex CLI path was not supplied by the review launcher");
    const conversation = {
      instructions:
        "Continue this agent conversation. Propose tool calls using only the supplied function tools, or return the final text. Use the owning runtime's tool call IDs from the conversation as evidence references. Do not claim you ran proposed calls. Encode tool arguments as JSON strings. For a JSON final response, encode it in text.",
      conversation: options.prompt,
      tools: options.tools ?? [],
      toolChoice: options.toolChoice ?? { type: "auto" },
      responseFormat: options.responseFormat,
    };
    const signal = AbortSignal.any([
      ...(options.abortSignal ? [options.abortSignal] : []),
      AbortSignal.timeout(180000),
    ]);
    const usage = {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
    };
    let result: LanguageModelV4GenerateResult | undefined;
    let correction: string | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      signal.throwIfAborted();
      const response = await respond({
        cli,
        home,
        model,
        prompt: JSON.stringify({ ...conversation, correction }),
        schema: z.toJSONSchema(proposalSchema),
        signal,
      });
      signal.throwIfAborted();
      for (const key of Object.keys(usage) as (keyof typeof usage)[])
        usage[key] += response.usage![key];
      try {
        result = proposedResponse(response.text, options);
        break;
      } catch (error) {
        if (attempt === 1) throw error;
        const detail = error instanceof Error ? error.message : String(error);
        correction = `Your previous proposal failed validation: ${detail.slice(0, 2000)}. No proposed calls were executed. Return a corrected complete proposal. Encode each tool input as a valid JSON string matching its supplied schema.`;
      }
    }
    if (!result) throw new Error("Codex did not produce a valid proposal");
    result.usage = {
      inputTokens: {
        total: usage.inputTokens,
        noCache: usage.inputTokens - usage.cachedInputTokens,
        cacheRead: usage.cachedInputTokens,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: usage.outputTokens,
        text: usage.outputTokens - usage.reasoningOutputTokens,
        reasoning: usage.reasoningOutputTokens,
      },
    };
    return result;
  }
  return {
    specificationVersion: "v4",
    provider: "codex",
    modelId: model,
    supportedUrls: {},
    doGenerate: generate,
    async doStream(options) {
      const result = await generate(options);
      return {
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            controller.enqueue({ type: "stream-start", warnings: result.warnings });
            for (const part of result.content) {
              if (part.type === "text") {
                controller.enqueue({ type: "text-start", id: "text" });
                controller.enqueue({ type: "text-delta", id: "text", delta: part.text });
                controller.enqueue({ type: "text-end", id: "text" });
              } else if (part.type === "tool-call") controller.enqueue(part);
            }
            controller.enqueue({
              type: "finish",
              finishReason: result.finishReason,
              usage: result.usage,
            });
            controller.close();
          },
        }),
      };
    },
  };
}
