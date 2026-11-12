/** Resolve fixed demo narratives and guard response-only browser persistence. */
import { ASSISTANT_RESPONSES, ASSISTANT_FALLBACK } from '../data/assistantResponses.js';
import { readJson, writeJson, STORAGE_KEYS } from './localStorage.js';

/** @typedef {{id:string, role:'assistant', text:string, createdAt:string}} AssistantMessage */

/** Select the first whole token in the documented priority order.
 * Args:
 *   prompt: User text; invalid input resolves to the same neutral fallback.
 * Returns:
 *   A fixed response and its matched keyword, without side effects.
 */
export function resolveAssistantPrompt(prompt) {
  if (typeof prompt === 'string') {
    for (const keyword of Object.keys(ASSISTANT_RESPONSES)) {
      if (new RegExp(`(^|[^\\p{L}\\p{N}_])${keyword}($|[^\\p{L}\\p{N}_])`, 'iu').test(prompt)) {
        return { keyword, text: ASSISTANT_RESPONSES[keyword] };
      }
    }
  }
  return { keyword: null, text: ASSISTANT_FALLBACK };
}

/** Accept only complete response records, rejecting prompts and tampered narratives.
 * Args:
 *   value: Untrusted parsed storage or a proposed write.
 * Returns:
 *   Whether the current version contains unique, strictly shaped response records.
 */
function validHistory(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join(',') !== 'messages,version'
      || value.version !== 1 || !Array.isArray(value.messages)) return false;
  const ids = new Set();
  return value.messages.every((message) => {
    if (!message || typeof message !== 'object' || Array.isArray(message)
        || Object.keys(message).sort().join(',') !== 'createdAt,id,role,text'
        || typeof message.id !== 'string' || !/^local-[1-9]\d*$/.test(message.id)
        || !Number.isSafeInteger(Number(message.id.slice(6)))
        || Number(message.id.slice(6)) >= Number.MAX_SAFE_INTEGER
        || ids.has(message.id) || message.role !== 'assistant'
        || ![...Object.values(ASSISTANT_RESPONSES), ASSISTANT_FALLBACK].includes(message.text)
        || typeof message.createdAt !== 'string'
        || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(message.createdAt)
        || !Number.isFinite(Date.parse(message.createdAt))
        || new Date(message.createdAt).toISOString() !== message.createdAt) return false;
    ids.add(message.id);
    return true;
  });
}

/** Save only validated fixed responses; never persist user prompts.
 * Args:
 *   messages: Complete response history proposed by explicit user activation.
 * Returns:
 *   Success or a recoverable validation/write code; never throws for invalid records.
 */
export function persistAssistantMessages(messages) {
  const value = { version: 1, messages };
  if (!validHistory(value)) return { ok: false, code: 'INVALID_LOCAL_STATE' };
  return writeJson(STORAGE_KEYS.assistant, value);
}

/** Restore supported response history without modifying invalid saved data.
 * Returns:
 *   Validated messages and availability, with a recoverable code on failure.
 */
export function readAssistantMessages() {
  const result = readJson(STORAGE_KEYS.assistant, validHistory);
  if (!result.ok) return { messages: [], available: false, code: result.code };
  return { messages: result.value?.messages ?? [], available: true };
}
