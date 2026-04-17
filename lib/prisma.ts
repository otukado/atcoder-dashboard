import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { DataType, newDb } from "pg-mem";

function createInMemoryDevPool() {
  const db = newDb({ autoCreateForeignKeyIndices: true });

  db.public.registerFunction({
    name: "current_database",
    returns: DataType.text,
    implementation: () => "atcoder_dashboard_dev",
  });

  const migrationsDir = path.join(process.cwd(), "prisma", "migrations");
  if (fs.existsSync(migrationsDir)) {
    const migrationFolders = fs
      .readdirSync(migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));

    for (const folder of migrationFolders) {
      const migrationSqlPath = path.join(
        migrationsDir,
        folder,
        "migration.sql",
      );
      if (!fs.existsSync(migrationSqlPath)) {
        continue;
      }

      const sql = fs.readFileSync(migrationSqlPath, "utf-8").trim();
      if (sql.length === 0) {
        continue;
      }

      db.public.none(sql);
    }
  }

  const { Pool } = db.adapters.createPg();
  return new Pool();
}

const defaultDevDatabaseUrl =
  "postgresql://postgres:postgres@localhost:5432/atcoder_dashboard_dev";
const shouldUseInMemoryDevDb =
  process.env.NODE_ENV === "development" && !process.env.DATABASE_URL;
const adapter = shouldUseInMemoryDevDb
  ? new PrismaPg(createInMemoryDevPool(), { disposeExternalPool: true })
  : new PrismaPg({
      connectionString: process.env.DATABASE_URL ?? defaultDevDatabaseUrl,
    });

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
