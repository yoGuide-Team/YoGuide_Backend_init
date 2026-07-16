import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  // Tells the CLI where your schema is located
  schema: "prisma/schema.prisma",

  // Point to the engine you are running (required for Prisma v7)
  engine: "classic",

  // Database URL loaded securely via the config helper
  datasource: {
    url: env("DATABASE_URL"),
  },

  // Configures migration behaviors and links your TS seed file
  migrations: {
    path: "prisma/migrations",
    seed: "ts-node prisma/seed.ts", 
  },
});