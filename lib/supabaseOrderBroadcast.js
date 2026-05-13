const { createClient } = require("@supabase/supabase-js");

/** @type {import("@supabase/supabase-js").SupabaseClient | null} */
let supabase = null;

const REALTIME_ORDER_EVENT = "order_event";

function topicForTable(tableId) {
  return `orders:${String(tableId).trim()}`;
}

function getClient() {
  const url = (process.env.SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) return null;
  if (!supabase) {
    supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabase;
}

/**
 * Pushes the same JSON envelope the app used to receive over WebSocket
 * (`order_updated` / `order_deleted`) via Supabase Realtime broadcast (REST).
 *
 * @param {string} tableId
 * @param {{ type: string, order?: unknown, order_id?: string }} payload
 */
async function broadcastToTable(tableId, payload) {
  const sb = getClient();
  if (!sb) {
    console.warn(
      "Supabase broadcast skipped: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in mock-api/.env",
    );
    return;
  }
  const topic = topicForTable(tableId);
  const channel = sb.channel(topic);
  try {
    await channel.httpSend(REALTIME_ORDER_EVENT, payload);
  } catch (e) {
    console.warn("Supabase Realtime broadcast failed", topic, e?.message || e);
  }
}

module.exports = {
  broadcastToTable,
  topicForTable,
  REALTIME_ORDER_EVENT,
};
