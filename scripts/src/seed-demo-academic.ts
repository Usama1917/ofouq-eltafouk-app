import { pool } from "@workspace/db";
import { seedDemoAcademic } from "@workspace/db/seeds/demo-academic";

async function main() {
  const result = await seedDemoAcademic();
  console.log(
    `[seed-demo-academic] years=${result.years} subjects=${result.subjects} units=${result.units} lessons=${result.lessons} videos=${result.videos} segments=${result.segments} subscriptions=${result.subscriptions}`,
  );
}

main()
  .catch((err) => {
    console.error("[seed-demo-academic] failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
