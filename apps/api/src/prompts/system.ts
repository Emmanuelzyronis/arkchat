import type { Memory } from '@arkchat/types';

/**
 * Builds the full system prompt injected into every Claude request.
 * Ordering: role definition → date → memory context → custom instructions → formatting rules.
 */
export function buildSystemPrompt(
  memories: Memory[],
  customInstructions?: string,
): string {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const sections: string[] = [];

  // ── Role definition ──────────────────────────────────────────────────────
  sections.push(
    `You are ArkChat, a highly capable AI assistant built on Claude. You are helpful, honest, and direct. You adapt your communication style to the user's needs — technical when they need precision, conversational when they want to chat.`,
  );

  // ── Current date ─────────────────────────────────────────────────────────
  sections.push(`Today's date is ${today}.`);

  // ── Long-term memory context ──────────────────────────────────────────────
  if (memories.length > 0) {
    const memoryLines = memories
      .sort((a, b) => b.importance - a.importance)
      .map((m) => `- ${m.content}`)
      .join('\n');

    sections.push(
      `<memory>\nYou have the following memories about the user. Use them to personalise your responses, but do not repeat them back verbatim unless the user asks:\n${memoryLines}\n</memory>`,
    );
  }

  // ── Custom instructions ───────────────────────────────────────────────────
  if (customInstructions?.trim()) {
    sections.push(
      `<user_instructions>\nThe user has provided the following personal instructions. Always follow them:\n${customInstructions.trim()}\n</user_instructions>`,
    );
  }

  // ── Response formatting guidelines ────────────────────────────────────────
  sections.push(
    [
      `Formatting guidelines:`,
      `- Use markdown only when it improves clarity (code blocks, lists, headers). Avoid over-formatting casual replies.`,
      `- For code, always specify the language in fenced code blocks.`,
      `- Keep responses concise unless the user asks for detail.`,
      `- Never fabricate facts. If you are uncertain, say so.`,
    ].join('\n'),
  );

  return sections.join('\n\n');
}
