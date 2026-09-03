const path = require('path');
const { GoogleGenAI } = require('@google/genai');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const DEFAULT_MODEL = 'gemini-3.1-flash-lite';

class GeminiError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = 'GeminiError';
    this.statusCode = statusCode;
  }
}

let cachedClient = null;

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiError('Gemini API key is invalid or unauthorized.', 503);
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({ apiKey });
  }
  return cachedClient;
}

function mapGeminiError(err) {
  if (err instanceof GeminiError) return err;

  const message = err?.message || String(err);
  const status = err?.status || err?.statusCode || err?.code;
  const combined = `${status || ''} ${message}`;

  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(combined)) {
    return new GeminiError('Gemini free-tier quota exceeded. Try again later.', 429);
  }
  if (status === 401 || status === 403 || /api key|unauthorized|invalid/i.test(combined)) {
    return new GeminiError('Gemini API key is invalid or unauthorized.', 503);
  }
  return new GeminiError(message.slice(0, 200), 502);
}

function getGeminiModel() {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

function parseJsonLenient(text) {
  if (!text || !String(text).trim()) {
    throw new GeminiError('Gemini returned empty response.', 502);
  }

  const stripped = String(text)
    .trim()
    .replace(/^\uFEFF/, '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');

  try {
    return JSON.parse(stripped);
  } catch {
    const start = stripped.indexOf('{');
    const end = stripped.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(stripped.slice(start, end + 1));
      } catch {
        throw new GeminiError('Gemini returned invalid JSON.', 502);
      }
    }
    throw new GeminiError('Gemini returned invalid JSON.', 502);
  }
}

function finishReason(response) {
  return response?.candidates?.[0]?.finishReason || response?.candidates?.[0]?.finish_reason || null;
}

async function generateGeminiJson({ contents, systemInstruction, responseJsonSchema, maxOutputTokens }) {
  const ai = getGeminiClient();
  const request = {
    model: getGeminiModel(),
    contents,
    config: {
      systemInstruction,
      temperature: 0,
      topP: 1,
      seed: 0,
      maxOutputTokens,
      responseMimeType: 'application/json',
      responseJsonSchema,
      thinkingConfig: { thinkingBudget: 0, includeThoughts: false },
    },
  };

  let response;
  try {
    response = await ai.models.generateContent(request);
  } catch (err) {
    throw mapGeminiError(err);
  }

  const text = response?.text;
  const reason = finishReason(response);

  try {
    return parseJsonLenient(text);
  } catch (err) {
    if (reason === 'MAX_TOKENS' || reason === 'LENGTH') {
      throw new GeminiError('Gemini output was truncated.', 502);
    }
    if (err instanceof GeminiError) throw err;
    throw new GeminiError('Gemini returned invalid JSON.', 502);
  }
}

module.exports = {
  GeminiError,
  getGeminiClient,
  getGeminiModel,
  generateGeminiJson,
  mapGeminiError,
};
