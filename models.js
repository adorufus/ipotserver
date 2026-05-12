const mongoose = require("mongoose");

const tableMenuSchema = new mongoose.Schema(
  {
    table_id: { type: String, required: true, unique: true },
    restaurant: { type: mongoose.Schema.Types.Mixed, required: true },
    categories: { type: [mongoose.Schema.Types.Mixed], default: [] },
    items: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { collection: "menus", versionKey: false }
);

const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true },
  },
  { collection: "counters", versionKey: false }
);

const orderSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    restaurant_id: String,
    table_id: String,
    status: String,
    estimated_prep_time_minutes: Number,
    customer_note: String,
    created_at: String,
    updated_at: String,
    timeline: { type: [mongoose.Schema.Types.Mixed], default: [] },
    subtotal: Number,
    total: Number,
    currency: String,
    items: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { collection: "orders", id: false, versionKey: false }
);

const TableMenu = mongoose.models.TableMenu || mongoose.model("TableMenu", tableMenuSchema);
const Counter = mongoose.models.Counter || mongoose.model("Counter", counterSchema);
const Order = mongoose.models.Order || mongoose.model("Order", orderSchema);

module.exports = { mongoose, TableMenu, Counter, Order };
