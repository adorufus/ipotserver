const { TableMenu, Counter } = require("../models");
const { MENU_BY_TABLE } = require("../data/seedMenus");

/**
 * Inserts static menus and order counter if collections are empty.
 */
async function ensureSeed() {
  const menuCount = await TableMenu.countDocuments();
  if (menuCount === 0) {
    for (const [tableId, menu] of Object.entries(MENU_BY_TABLE)) {
      await TableMenu.create({
        table_id: tableId,
        restaurant: menu.restaurant,
        categories: menu.categories,
        items: menu.items,
      });
    }
    console.log("Seeded menus from static data");
  }

  const counter = await Counter.findById("order");
  if (!counter) {
    await Counter.create({ _id: "order", seq: 10000 });
    console.log("Seeded order id counter");
  }
}

module.exports = { ensureSeed };
