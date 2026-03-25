export type OpenRouterRole = "system" | "user" | "assistant"

export type OpenRouterMessage = {
  role: OpenRouterRole
  content: string
}

export type OpenRouterChatOptions = {
  model?: string
  temperature?: number
  maxTokens?: number
  referer?: string
  title?: string
  retries?: number
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function extractTextFromContentPart(part: any): string {
  if (typeof part === "string") return part.trim()

  if (!part || typeof part !== "object") return ""

  if (isNonEmptyString(part.text)) return part.text.trim()

  if (part.type === "text" && isNonEmptyString(part.text)) {
    return part.text.trim()
  }

  if (isNonEmptyString(part.content)) return part.content.trim()

  return ""
}

function extractAssistantContent(data: any): string | null {
  const choice = data?.choices?.[0]

  const messageContent = choice?.message?.content

  if (isNonEmptyString(messageContent)) {
    return messageContent.trim()
  }

  if (Array.isArray(messageContent)) {
    const joined = messageContent
      .map(extractTextFromContentPart)
      .filter(Boolean)
      .join("\n")
      .trim()

    if (joined) return joined
  }

  if (isNonEmptyString(choice?.text)) {
    return choice.text.trim()
  }

  const deltaContent = choice?.delta?.content

  if (isNonEmptyString(deltaContent)) {
    return deltaContent.trim()
  }

  if (Array.isArray(deltaContent)) {
    const joined = deltaContent
      .map(extractTextFromContentPart)
      .filter(Boolean)
      .join("\n")
      .trim()

    if (joined) return joined
  }

  if (isNonEmptyString(data?.output_text)) {
    return data.output_text.trim()
  }

  if (Array.isArray(data?.output)) {
    const joined = data.output
      .map(extractTextFromContentPart)
      .filter(Boolean)
      .join("\n")
      .trim()

    if (joined) return joined
  }

  return null
}

function shouldRetryStatus(status: number) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500
}

function getRetryDelayMs(attempt: number) {
  return 400 * (attempt + 1)
}

export async function openRouterChat(
  messages: OpenRouterMessage[],
  options: OpenRouterChatOptions = {}
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY")
  }

  const baseUrl = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1"
  const model = options.model ?? process.env.OPENROUTER_MODEL ?? "openrouter/free"
  const retries = options.retries ?? 2

  let lastErr: unknown = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": options.referer ?? "http://localhost:3000",
          "X-Title": options.title ?? "PaintPro",
        },
        body: JSON.stringify({
          model,
          temperature: options.temperature ?? 0,
          max_tokens: options.maxTokens ?? 500,
          messages,
        }),
      })

      const rawText = await response.text()

      if (!response.ok) {
        if (shouldRetryStatus(response.status) && attempt < retries) {
          await sleep(getRetryDelayMs(attempt))
          continue
        }

        throw new Error(`OpenRouter request failed (${response.status}): ${rawText}`)
      }

      let data: any = null

      try {
        data = rawText ? JSON.parse(rawText) : null
      } catch {
        throw new Error(`OpenRouter returned a non-JSON response: ${rawText || "[empty body]"}`)
      }

      const content = extractAssistantContent(data)

      if (content) {
        return content
      }

      if (attempt < retries) {
        await sleep(250 * (attempt + 1))
        continue
      }

      console.error("[openRouterChat] No assistant content. Parsed response:", data)
      throw new Error("OpenRouter returned no assistant content")
    } catch (error) {
      lastErr = error

      if (attempt < retries) {
        await sleep(getRetryDelayMs(attempt))
        continue
      }
    }
  }

  throw lastErr ?? new Error("OpenRouter call failed")
}
