const { WebSocketServer } = require("ws");

/** @type {Map<string, Set<import('ws').WebSocket>>} */
const tableSubscribers = new Map();

function subscribeTable(tableId, ws) {
  if (!tableSubscribers.has(tableId)) {
    tableSubscribers.set(tableId, new Set());
  }
  tableSubscribers.get(tableId).add(ws);
}

function unsubscribeTable(tableId, ws) {
  const set = tableSubscribers.get(tableId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) tableSubscribers.delete(tableId);
}

function broadcastToTable(tableId, message) {
  const set = tableSubscribers.get(tableId);
  if (!set) return;
  const payload = JSON.stringify(message);
  for (const client of set) {
    if (client.readyState === 1 /* OPEN */) {
      try {
        client.send(payload);
      } catch (_) {
        /* ignore */
      }
    }
  }
}

/**
 * @param {import('http').Server} server
 * @param {string} wsPath e.g. /api/v1/ws/orders
 */
function attachOrderWebSocket(server, wsPath) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    try {
      const host = request.headers.host || "localhost";
      const pathname = new URL(request.url || "/", `http://${host}`).pathname;
      if (pathname !== wsPath) {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        const url = new URL(request.url || "/", `http://${host}`);
        const tableId = String(url.searchParams.get("table_id") || "").trim();
        if (!tableId) {
          ws.close(1008, "table_id query parameter required");
          return;
        }

        subscribeTable(tableId, ws);
        ws.on("close", () => unsubscribeTable(tableId, ws));
        ws.on("error", () => unsubscribeTable(tableId, ws));

        ws.send(
          JSON.stringify({
            type: "subscribed",
            table_id: tableId,
          }),
        );

        ws.on("message", (raw) => {
          try {
            const msg = JSON.parse(String(raw));
            if (msg.type === "ping") {
              ws.send(JSON.stringify({ type: "pong", t: Date.now() }));
            }
          } catch (_) {
            /* ignore invalid client frames */
          }
        });
      });
    } catch (e) {
      socket.destroy();
    }
  });

  return wss;
}

module.exports = {
  attachOrderWebSocket,
  broadcastToTable,
  subscribeTable,
  unsubscribeTable,
};
