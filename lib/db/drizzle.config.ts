import { defineConfig } from "drizzle-kit";
import path from "path";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRESQL_URL;

if (!DATABASE_URL) {
  throw new Error("Database URL missing. Set DATABASE_URL or POSTGRES_URL.");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: DATABASE_URL,
  },
});
