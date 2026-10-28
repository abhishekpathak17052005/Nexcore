import "dotenv/config";
import { getMongoDb } from "./mongo";

const db = await getMongoDb();
if (!db) {
  console.error("MONGODB_URI is required to create MongoDB indexes.");
  process.exit(1);
}
console.log(`MongoDB indexes verified for ${db.databaseName}`);
process.exit(0);
