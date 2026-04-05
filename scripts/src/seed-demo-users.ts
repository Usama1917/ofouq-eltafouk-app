import { pool } from "@workspace/db";
import { seedDemoUsers } from "@workspace/db/seeds/demo-users";

async function main() {
  const result = await seedDemoUsers();
  console.log(
    `[seed-demo-users] created=${result.created} updated=${result.updated} unchanged=${result.unchanged}`,
  );
}

main()
  .catch((err) => {
    console.error("[seed-demo-users] failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
