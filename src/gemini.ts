/**
 * Gemini API client for Reconstruction Judge
 */

import type { LLMResponse } from './types.js';

// Pricing for Gemini 2.5 Flash
const INPUT_COST_PER_MILLION = 0.15;
const OUTPUT_COST_PER_MILLION = 0.60;
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 180000;

export async function callGemini<T>(
  systemPrompt: string,
  userPrompt: string,
  options: { maxRetries?: number; timeout?: number; temperature?: number } = {}
): Promise<LLMResponse<T>> {
  const { maxRetries = MAX_RETRIES, timeout = REQUEST_TIMEOUT_MS, temperature = 0.1 } = options;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const requestBody = {
    system_instruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }],
      },
    ],
    generationConfig: {
      maxOutputTokens: 16384,
      temperature,
      responseMimeType: 'application/json',
    },
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      if (attempt > 0) {
        console.log(`  ⚠️  Attempt ${attempt} failed, retrying in ${Math.min(2000 * Math.pow(2, attempt), 30000) / 1000}s...`);
        await new Promise((r) => setTimeout(r, Math.min(2000 * Math.pow(2, attempt), 30000)));
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`  [Gemini] Error ${response.status}: ${errorText.slice(0, 200)}`);

        if (response.status === 429 || response.status >= 500) {
          const delay = Math.min(15000 * Math.pow(2, attempt), 120000);
          console.log(`  [Gemini] Rate limited, waiting ${delay}ms...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw new Error(`Gemini API error (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as Record<string, unknown>;

      const candidates = data.candidates as Array<Record<string, unknown>> | undefined;
      const parts = (candidates?.[0]?.content as Record<string, unknown>)?.parts as Array<Record<string, unknown>> | undefined;
      const content = parts
        ?.filter((p) => !p.thought && p.text)
        .map((p) => p.text as string)
        .join('') || '';

      const usage = (data.usageMetadata as Record<string, number>) || {};
      const promptTokens = usage.promptTokenCount || 0;
      const completionTokens = usage.candidatesTokenCount || 0;
      const totalTokens = usage.totalTokenCount || promptTokens + completionTokens;

      const cost =
        (promptTokens / 1_000_000) * INPUT_COST_PER_MILLION +
        (completionTokens / 1_000_000) * OUTPUT_COST_PER_MILLION;

      // Parse JSON
      const parsed = JSON.parse(content) as T;

      return {
        data: parsed,
        tokens: totalTokens,
        cost_usd: cost,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        // Will retry at top of loop
      }
    }
  }

  throw lastError || new Error('Gemini request failed');
}
