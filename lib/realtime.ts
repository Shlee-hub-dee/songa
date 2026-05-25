// Server-side Supabase Realtime broadcast helper. Uses the REST broadcast
// endpoint so we don't have to maintain a long-lived WebSocket from the
// serverless route handler.

type BroadcastMessage = {
  topic: string;
  event: string;
  payload: Record<string, unknown>;
  private?: boolean;
};

export async function broadcast(message: BroadcastMessage): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn('Realtime broadcast skipped: SUPABASE_SERVICE_ROLE_KEY not set');
    return;
  }
  try {
    const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        messages: [
          {
            topic: message.topic,
            event: message.event,
            payload: message.payload,
            private: message.private ?? false,
          },
        ],
      }),
      // Don't let a slow Realtime gateway stall the user's request.
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      console.warn('Realtime broadcast non-OK:', res.status, await res.text().catch(() => ''));
    }
  } catch (err) {
    console.warn('Realtime broadcast failed:', err);
  }
}

export const managerTopic = (managerId: string) => `manager:${managerId}`;
export const officerTopic = (officerId: string) => `officer:${officerId}`;
