/** Accès minimal à l'API Bot de Telegram : envoi de messages et liaison du compte. */

const API = 'https://api.telegram.org';

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

async function call<T>(token: string, method: string, body: unknown, fetcher: typeof fetch): Promise<T> {
  const res = await fetcher(`${API}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const data = (await res.json().catch(() => ({ ok: false }))) as TelegramResponse<T>;
  // Le message d'erreur ne reprend jamais l'adresse appelée : elle contient le jeton du bot.
  if (!data.ok || data.result === undefined) throw new Error(`Telegram ${method} : ${data.description ?? res.status}`);
  return data.result;
}

export function sendTelegram(token: string, chatId: string, text: string, fetcher: typeof fetch = fetch) {
  return call<unknown>(token, 'sendMessage', { chat_id: chatId, text, disable_web_page_preview: true }, fetcher);
}

export async function botUsername(token: string, fetcher: typeof fetch = fetch): Promise<string> {
  return (await call<{ username: string }>(token, 'getMe', {}, fetcher)).username;
}

interface Update {
  update_id: number;
  message?: { text?: string; chat: { id: number; type: string } };
}

/** Cherche, parmi les messages reçus par le bot, « /start <code> » envoyé en conversation privée. */
export async function findChatForCode(token: string, code: string, fetcher: typeof fetch = fetch): Promise<string | null> {
  const updates = await call<Update[]>(token, 'getUpdates', { allowed_updates: ['message'], timeout: 0 }, fetcher);
  const match = updates.find((u) => u.message?.chat.type === 'private' && u.message.text?.trim() === `/start ${code}`);
  return match ? String(match.message!.chat.id) : null;
}
