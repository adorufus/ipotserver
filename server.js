require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const http = require("http");
const express = require("express");
const cors = require("cors");
const { mongoose, TableMenu, Counter, Order } = require("./models");
const { computeTotals } = require("./lib/orderTotals");
const { ensureSeed } = require("./lib/seed");
const { attachOrderWebSocket, broadcastToTable } = require("./lib/orderWs");

const STATUSES = ["pending", "confirmed", "preparing", "ready", "served"];
const WS_PATH = "/api/v1/ws/orders";
const ORDER_STATUS_STEP_MS = Math.max(500, Number(process.env.ORDER_STATUS_STEP_MS || 4000));

const app = express();
app.use(cors());
app.use(express.json());

function menuDocToResponse(doc) {
  if (!doc) return null;
  return {
    restaurant: doc.restaurant,
    categories: doc.categories,
    items: doc.items,
  };
}

function orderDocToWire(doc) {
  if (!doc) return null;
  const o = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  return o;
}

function emitOrderUpdated(tableId, orderWire) {
  broadcastToTable(tableId, { type: "order_updated", order: orderWire });
}

function emitOrderDeleted(tableId, orderId) {
  broadcastToTable(tableId, { type: "order_deleted", order_id: orderId });
}

/** Advances pending → confirmed → … → served with [ORDER_STATUS_STEP_MS] between each step. */
async function simulateOrderLifecycle(orderId) {
  for (let fromIdx = 0; fromIdx < STATUSES.length - 1; fromIdx++) {
    await new Promise((r) => setTimeout(r, ORDER_STATUS_STEP_MS));
    const doc = await Order.findOne({ id: orderId });
    if (!doc) return;
    if (doc.status !== STATUSES[fromIdx]) return;
    const next = STATUSES[fromIdx + 1];
    const now = new Date().toISOString();
    doc.status = next;
    doc.updated_at = now;
    doc.timeline = [...(doc.timeline || []), { status: next, at: now }];
    await doc.save();
    emitOrderUpdated(doc.table_id, orderDocToWire(doc));
  }
}

app.get("/api/v1/health", (_req, res) => {
  const dbOk = mongoose.connection.readyState === 1;
  res.json({
    status: dbOk ? "ok" : "degraded",
    time: new Date().toISOString(),
    version: "1.0.0",
    database: dbOk ? "connected" : "disconnected",
  });
});

app.get("/api/v1/menu", async (req, res) => {
  try {
    const tableId = String(req.query.table_id || "");
    const doc = await TableMenu.findOne({ table_id: tableId }).lean();
    const menu = doc ? menuDocToResponse(doc) : null;
    if (!menu) {
      return res.status(404).json({
        error: { code: "MENU_NOT_FOUND", message: `No menu for table_id=${tableId}` },
      });
    }
    res.json(menu);
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to load menu" },
    });
  }
});

app.post("/api/v1/orders", async (req, res) => {
  try {
    const { table_id, items, customer_note } = req.body || {};
    const tableId = String(table_id || "");

    const doc = await TableMenu.findOne({ table_id: tableId }).lean();
    const menu = doc ? menuDocToResponse(doc) : null;
    if (!menu) {
      return res.status(404).json({
        error: { code: "TABLE_NOT_FOUND", message: `Unknown table_id: ${tableId}` },
      });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(422).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid order payload",
          details: [{ field: "items", message: "Must be a non-empty array" }],
        },
      });
    }

    let totals;
    try {
      totals = computeTotals({ menu, requestItems: items });
    } catch (e) {
      if (e.code === "OPTION_NOT_FOUND") {
        return res.status(422).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid order payload",
            details: [{ field: "items.customizations.option_id", message: e.message }],
          },
        });
      }
      if (e.code === "MENU_ITEM_NOT_FOUND") {
        return res.status(422).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid order payload",
            details: [{ field: "items.menu_item_id", message: e.message }],
          },
        });
      }
      return res.status(422).json({
        error: { code: "VALIDATION_ERROR", message: e.message },
      });
    }

    const counter = await Counter.findByIdAndUpdate(
      "order",
      { $inc: { seq: 1 } },
      { new: true }
    );
    if (!counter) {
      return res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Order counter not initialized" },
      });
    }

    const orderId = `O${counter.seq}`;
    const now = new Date().toISOString();

    const order = {
      id: orderId,
      restaurant_id: menu.restaurant.id,
      table_id: tableId,
      status: "pending",
      estimated_prep_time_minutes: 18,
      customer_note: String(customer_note || ""),
      created_at: now,
      updated_at: now,
      timeline: [{ status: "pending", at: now }],
      ...totals,
    };

    await Order.create(order);
    emitOrderUpdated(tableId, orderDocToWire(order));
    simulateOrderLifecycle(orderId).catch((err) =>
      console.error("simulateOrderLifecycle", err)
    );
    res.status(201).json({ order });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to create order" },
    });
  }
});

app.get("/api/v1/orders/:orderId", async (req, res) => {
  try {
    const orderId = String(req.params.orderId);
    const doc = await Order.findOne({ id: orderId }).lean();
    if (!doc) {
      return res.status(404).json({
        error: { code: "ORDER_NOT_FOUND", message: `Order not found: ${orderId}` },
      });
    }
    res.json({ order: orderDocToWire(doc) });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to load order" },
    });
  }
});

app.get("/api/v1/orders", async (req, res) => {
  try {
    const tableId = req.query.table_id ? String(req.query.table_id) : null;
    const filter = tableId ? { table_id: tableId } : {};
    const docs = await Order.find(filter).sort({ created_at: -1 }).lean();
    res.json({ orders: docs.map(orderDocToWire) });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to list orders" },
    });
  }
});

app.patch("/api/v1/orders/:orderId", async (req, res) => {
  try {
    const orderId = String(req.params.orderId);
    const doc = await Order.findOne({ id: orderId });
    if (!doc) {
      return res.status(404).json({
        error: { code: "ORDER_NOT_FOUND", message: `Order not found: ${orderId}` },
      });
    }

    const nextStatus = req.body?.status;
    if (nextStatus && !STATUSES.includes(nextStatus)) {
      return res.status(422).json({
        error: { code: "VALIDATION_ERROR", message: `Invalid status: ${nextStatus}` },
      });
    }

    const now = new Date().toISOString();
    if (nextStatus && nextStatus !== doc.status) {
      doc.status = nextStatus;
      doc.updated_at = now;
      doc.timeline = [...(doc.timeline || []), { status: nextStatus, at: now }];
    }

    if (typeof req.body?.estimated_prep_time_minutes === "number") {
      doc.estimated_prep_time_minutes = req.body.estimated_prep_time_minutes;
      doc.updated_at = now;
    }

    await doc.save();
    emitOrderUpdated(doc.table_id, orderDocToWire(doc));
    res.json({ order: orderDocToWire(doc) });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to update order" },
    });
  }
});

app.delete("/api/v1/orders/:orderId", async (req, res) => {
  try {
    const orderId = String(req.params.orderId);
    const existing = await Order.findOne({ id: orderId }).lean();
    if (!existing) {
      return res.status(404).json({
        error: { code: "ORDER_NOT_FOUND", message: `Order not found: ${orderId}` },
      });
    }
    await Order.deleteOne({ id: orderId });
    if (existing.table_id) {
      emitOrderDeleted(String(existing.table_id), orderId);
    }
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to delete order" },
    });
  }
});

const PORT = process.env.PORT || 4000;

const uri = (process.env.MONGODB_URI || "").trim();
if (!uri) {
  console.error("Missing MONGODB_URI. Copy mock-api/.env.example to mock-api/.env and set the URI.");
  process.exit(1);
}

const server = http.createServer(app);
attachOrderWebSocket(server, WS_PATH);

mongoose
  .connect(uri)
  .then(async () => {
    await ensureSeed();
    server.listen(PORT, () => {
      console.log(
        `Mock API listening on port ${PORT} (MongoDB + WebSocket ${WS_PATH}, status step ${ORDER_STATUS_STEP_MS}ms)`
      );
    });
  })
  .catch((err) => {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  });
