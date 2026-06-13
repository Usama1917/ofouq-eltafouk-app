// Safety guard for demo seed scripts. The demo seeds create privileged accounts
// (owner/admin) and demo content, which must NEVER land in a production database.
// Running a seed only proceeds when the target is clearly a local database, unless
// the operator explicitly opts in with ALLOW_SEED=1.
export function assertSeedAllowed(label: string) {
  if (process.env.ALLOW_SEED === "1") return;

  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRESQL_URL ||
    "";

  const isLocalTarget = /@(localhost|127\.0\.0\.1|::1|postgres-local|host\.docker\.internal)[:/]/i.test(url);

  if (process.env.NODE_ENV === "production" || !isLocalTarget) {
    throw new Error(
      `[${label}] Refusing to seed: the target database does not look local ` +
        `(NODE_ENV=${process.env.NODE_ENV ?? "unset"}). This script creates demo owner/admin ` +
        `accounts and must not run against production. Set ALLOW_SEED=1 to override intentionally.`,
    );
  }
}
