const MENU_BY_TABLE = {
  T001: {
    restaurant: { id: "R001", name: "Sushi Zen", table_id: "T001" },
    categories: [
      { id: 1, name: "Appetizers", sort_order: 1 },
      { id: 2, name: "Main Course", sort_order: 2 },
      { id: 3, name: "Drinks", sort_order: 3 },
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
              { id: 3, name: "Chili Flakes", price_modifier: 0.5 },
            ],
          },
        ],
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
              { id: 5, name: "Large (12pc)", price_modifier: 8.0 },
            ],
          },
        ],
      },
      {
        id: 3,
        name: "Green Tea",
        description: "Hot Japanese green tea",
        price: 3.5,
        category_id: 3,
        image_url: null,
        customization_groups: [],
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
              { id: 9, name: "Extra Spicy", price_modifier: 1.0 },
            ],
          },
          {
            id: 4,
            name: "Add-ons",
            required: false,
            max_selections: 3,
            options: [
              { id: 10, name: "Extra Egg", price_modifier: 2.0 },
              { id: 11, name: "Extra Chashu", price_modifier: 4.0 },
              { id: 12, name: "Corn", price_modifier: 1.0 },
            ],
          },
        ],
      },
    ],
  },
};

module.exports = { MENU_BY_TABLE };
