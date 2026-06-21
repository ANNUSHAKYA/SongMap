// lib/geminiClient.ts
/**
 * Gemini API wrapper with model rotation and quota handling.
 * Models are tried in order; when one hits quota the next is attempted.
 * Free-tier limits (approx, per day):
 *   gemini-2.0-flash-lite  – 1,500 req/day
 *   gemini-2.0-flash        – 1,500 req/day  (separate bucket)
 *   gemini-flash-lite-latest – alias for flash-lite
 *   gemini-3.5-flash        – separate bucket
 */

export class GeminiQuotaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GeminiQuotaError'
  }
}

/** All models to try in preference order. */
const MODELS = [
  // Verified active models with current quota
  'gemini-2.5-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
  
  // Other models to fall back on
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash-001',
  'gemini-2.0-flash-lite-001',
  'gemini-2.5-pro',
  'gemini-pro-latest',
  'gemini-3-pro-preview',
  'gemini-3.1-pro-preview'
]

/** Track which models have hit their daily quota so we skip them fast. */
const exhaustedModels = new Set<string>()

async function callModel(
  model: string,
  prompt: string,
  maxTokens: number,
  apiKey: string,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const body: any = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: maxTokens },
  }

  // Disable thinking budget to ensure we do not run out of tokens or get truncated
  if (model.includes('2.0') || model.includes('2.5') || model.includes('3.')) {
    body.generationConfig.thinkingConfig = {
      thinkingBudget: 0
    }
  }

  const maxRetries = 2
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      const data = await res.json()
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      return text
    }

    const errText = await res.text()

    // 429 – rate limit / quota exhausted: throw immediately to rotate model without blocking
    if (res.status === 429) {
      exhaustedModels.add(model)
      throw new GeminiQuotaError(`Model ${model} hit rate limit / quota (429). Rotating to next model.`)
    }

    // 503 – service unavailable, short retry
    if (res.status === 503 && attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, 1500 * attempt))
      continue
    }

    throw new Error(`Gemini API error ${res.status} on ${model}: ${errText}`)
  }
  throw new Error(`Gemini failed after retries on ${model}`)
}

export async function callGemini(prompt: string, maxTokens: number): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set in the environment')

  const available = MODELS.filter((m) => !exhaustedModels.has(m))
  if (available.length === 0) {
    throw new GeminiQuotaError('All Gemini models have hit their daily quota.')
  }

  for (const model of available) {
    try {
      console.log(`[Gemini] Trying model: ${model}`)
      const result = await callModel(model, prompt, maxTokens, apiKey)
      return result
    } catch (err) {
      if (err instanceof GeminiQuotaError) {
        console.warn(`[Gemini] ${model} quota exhausted, trying next model…`)
        continue // try next model
      }
      throw err // non-quota errors bubble up immediately
    }
  }

  throw new GeminiQuotaError('All Gemini models have hit their daily quota.')
}
