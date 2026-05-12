const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const MENU_BY_TABLE = {
  T001: {
    restaurant: { id: "R001", name: "Sushi Zen", table_id: "T001" },
    categories: [
      { id: 1, name: "Appetizers", sort_order: 1 },
      { id: 2, name: "Main Course", sort_order: 2 },
      { id: 3, name: "Drinks", sort_order: 3 }
    ],
    items: [
      {
        id: 1,
        name: "Edamame",
        description: "Steamed soybeans with sea salt",
        price: 5.99,
        category_id: 1,
        image_url: null,
        customization_groups: [
          {
            id: 1,
            name: "Seasoning",
            required: false,
            max_selections: 2,
            options: [
              { id: 1, name: "Sea Salt", price_modifier: 0 },
              { id: 2, name: "Truffle Salt", price_modifier: 1.5 },
              { id: 3, name: "Chili Flakes", price_modifier: 0.5 }
            ]
          }
        ]
      },
      {
        id: 2,
        name: "Salmon Sashimi",
        description: "Fresh Norwegian salmon, 8 pieces",
        price: 16.99,
        category_id: 2,
        image_url: null,
        customization_groups: [
          {
            id: 2,
            name: "Size",
            required: true,
            max_selections: 1,
            options: [
              { id: 4, name: "Regular (8pc)", price_modifier: 0 },
              { id: 5, name: "Large (12pc)", price_modifier: 8.0 }
            ]
          }
        ]
      },
      {
        id: 3,
        name: "Green Tea",
        description: "Hot Japanese green tea",
        price: 3.5,
        category_id: 3,
        image_url: null,
        customization_groups: []
      },
      {
        id: 4,
        name: "Chicken Ramen",
        description: "Rich chicken broth with chashu, egg, and noodles",
        price: 14.99,
        category_id: 2,
        image_url: null,
        customization_groups: [
          {
            id: 3,
            name: "Spice Level",
            required: true,
            max_selections: 1,
            options: [
              { id: 6, name: "Mild", price_modifier: 0 },
              { id: 7, name: "Medium", price_modifier: 0 },
              { id: 8, name: "Spicy", price_modifier: 0 },
              { id: 9, name: "Extra Spicy", price_modifier: 1.0 }
            ]
          },
          {
            id: 4,
            name: "Add-ons",
            required: false,
            max_selections: 3,
            options: [
              { id: 10, name: "Extra Egg", price_modifier: 2.0 },
              { id: 11, name: "Extra Chashu", price_modifier: 4.0 },
              { id: 12, name: "Corn", price_modifier: 1.0 }
            ]
          }
        ]
      }
    ]
  }
};

// quick index for price & option modifiers
function buildIndexes(menu) {
  const itemById = new Map();
  const optionById = new Map();

  for (const item of menu.items) {
    itemById.set(item.id, item);
    for (const group of item.customization_groups || []) {
      for (const opt of group.options || []) optionById.set(opt.id, opt);
    }
  }
  return { itemById, optionById };
}

function computeTotals({ menu, requestItems }) {
  const { itemById, optionById } = buildIndexes(menu);

  let subtotal = 0;
  const enrichedItems = [];

  for (const req of requestItems) {
    const menuItem = itemById.get(req.menu_item_id);
    if (!menuItem) {
      const err = new Error(`Menu item not found: ${req.menu_item_id}`);
      err.code = "MENU_ITEM_NOT_FOUND";
      throw err;
    }

    const qty = Number(req.quantity || 0);
    if (!Number.isFinite(qty) || qty < 1) {
      const err = new Error(`Invalid quantity for item ${req.menu_item_id}`);
      err.code = "VALIDATION_ERROR";
      throw err;
    }

    let unit = Number(menuItem.price);
    const customizations = [];

    for (const c of req.customizations || []) {
      const opt = optionById.get(c.option_id);
      if (!opt) {
        const err = new Error(`Option not found: ${c.option_id}`);
        err.code = "OPTION_NOT_FOUND";
        err.field = `customizations.option_id`;
        throw err;
      }
      const cQty = Number(c.quantity || 0);
      if (!Number.isFinite(cQty) || cQty < 1) {
        const err = new Error(`Invalid customization quantity: ${c.option_id}`);
        err.code = "VALIDATION_ERROR";
        throw err;
      }
      unit += Number(opt.price_modifier) * cQty;
      customizations.push({
        option_id: opt.id,
        option_name: opt.name,
        price_modifier: opt.price_modifier,
        quantity: cQty
      });
    }

    const lineTotal = unit * qty;
    subtotal += lineTotal;

    enrichedItems.push({
      menu_item_id: menuItem.id,
      name: menuItem.name,
      unit_price: menuItem.price,
      quantity: qty,
      customizations,
      line_total: Number(lineTotal.toFixed(2))
    });
  }

  return {
    subtotal: Number(subtotal.toFixed(2)),
    total: Number(subtotal.toFixed(2)),
    currency: "USD",
    items: enrichedItems
  };
}

// ----- In-memory Orders DB -----
const ORDERS = new Map(); // orderId -> order object
let ORDER_SEQ = 10000;

const STATUSES = ["pending", "confirmed", "preparing", "ready", "served"];

// Health
app.get("/api/v1/health", (_req, res) => {
  res.json({ status: "ok", time: new Date().toISOString(), version: "1.0.0" });
});

// GET menu
app.get("/api/v1/menu", (req, res) => {
  const tableId = String(req.query.table_id || "");
  const menu = MENU_BY_TABLE[tableId];
  if (!menu) {
    return res.status(404).json({
      error: { code: "MENU_NOT_FOUND", message: `No menu for table_id=${tableId}` }
    });
  }
  res.json(menu);
});

// POST orders
app.post("/api/v1/orders", (req, res) => {
  const { table_id, items, customer_note } = req.body || {};
  const tableId = String(table_id || "");
  const menu = MENU_BY_TABLE[tableId];

  if (!menu) {
    return res.status(404).json({
      error: { code: "TABLE_NOT_FOUND", message: `Unknown table_id: ${tableId}` }
    });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(422).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid order payload",
        details: [{ field: "items", message: "Must be a non-empty array" }]
      }
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
          details: [{ field: "items.customizations.option_id", message: e.message }]
        }
      });
    }
    if (e.code === "MENU_ITEM_NOT_FOUND") {
      return res.status(422).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid order payload",
          details: [{ field: "items.menu_item_id", message: e.message }]
        }
      });
    }
    return res.status(422).json({
      error: { code: "VALIDATION_ERROR", message: e.message }
    });
  }

  const now = new Date().toISOString();
  const orderId = `O${++ORDER_SEQ}`;

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
    ...totals
  };

  ORDERS.set(orderId, order);
  res.status(201).json({ order });
});

// GET order by id
app.get("/api/v1/orders/:orderId", (req, res) => {
  const orderId = String(req.params.orderId);
  const order = ORDERS.get(orderId);
  if (!order) {
    return res.status(404).json({
      error: { code: "ORDER_NOT_FOUND", message: `Order not found: ${orderId}` }
    });
  }
  res.json({ order });
});

// GET orders list (dev helper)
app.get("/api/v1/orders", (req, res) => {
  const tableId = req.query.table_id ? String(req.query.table_id) : null;
  const orders = Array.from(ORDERS.values()).filter((o) =>
    tableId ? o.table_id === tableId : true
  );
  res.json({ orders });
});

// PATCH order (dev helper to advance status)
app.patch("/api/v1/orders/:orderId", (req, res) => {
  const orderId = String(req.params.orderId);
  const order = ORDERS.get(orderId);
  if (!order) {
    return res.status(404).json({
      error: { code: "ORDER_NOT_FOUND", message: `Order not found: ${orderId}` }
    });
  }

  const nextStatus = req.body?.status;
  if (nextStatus && !STATUSES.includes(nextStatus)) {
    return res.status(422).json({
      error: { code: "VALIDATION_ERROR", message: `Invalid status: ${nextStatus}` }
    });
  }

  const now = new Date().toISOString();
  if (nextStatus && nextStatus !== order.status) {
    order.status = nextStatus;
    order.updated_at = now;
    order.timeline = [...(order.timeline || []), { status: nextStatus, at: now }];
  }

  if (typeof req.body?.estimated_prep_time_minutes === "number") {
    order.estimated_prep_time_minutes = req.body.estimated_prep_time_minutes;
    order.updated_at = now;
  }

  ORDERS.set(orderId, order);
  res.json({ order });
});

// DELETE order (dev helper)
app.delete("/api/v1/orders/:orderId", (req, res) => {
  const orderId = String(req.params.orderId);
  if (!ORDERS.has(orderId)) {
    return res.status(404).json({
      error: { code: "ORDER_NOT_FOUND", message: `Order not found: ${orderId}` }
    });
  }
  ORDERS.delete(orderId);
  res.status(204).send();
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Mock API running on http://10.0.0.1:${PORT}`);
});