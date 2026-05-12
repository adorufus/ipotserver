/**
 * Connects to MongoDB and runs the same seed as server startup (menus + counter if missing).
 * Does not wipe existing data.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { mongoose } = require("../models");
const { ensureSeed } = require("../lib/seed");

const uri = (process.env.MONGODB_URI || "").trim();
if (!uri) {
  console.error("Missing MONGODB_URI in mock-api/.env");
  process.exit(1);
}

mongoose
  .connect(uri)
  .then(async () => {
    await ensureSeed();
    console.log("Seed check complete.");
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
