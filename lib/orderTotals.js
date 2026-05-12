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
        quantity: cQty,
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
      line_total: Number(lineTotal.toFixed(2)),
    });
  }

  return {
    subtotal: Number(subtotal.toFixed(2)),
    total: Number(subtotal.toFixed(2)),
    currency: "USD",
    items: enrichedItems,
  };
}

module.exports = { buildIndexes, computeTotals };
