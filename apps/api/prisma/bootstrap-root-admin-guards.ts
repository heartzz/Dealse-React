const LOCAL_DEVELOPMENT_DATABASE = Object.freeze({
  protocol: "postgresql:",
  hostname: "127.0.0.1",
  port: "5432",
  database: "dealse_dev",
  username: "dealse_dev_app",
});

export function assertDevelopmentBootstrapEnvironment(nodeEnv: string | undefined, bootstrapEnv: string | undefined): void {
  if (nodeEnv !== "development" || bootstrapEnv !== "development") {
    throw new Error("Root Admin bootstrap requires NODE_ENV=development and ADMIN_BOOTSTRAP_ENV=development.");
  }
}

export function assertAllowedBootstrapDatabaseTarget(connectionString: string): void {
  let target: URL;
  try {
    target = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL; no database changes were made.");
  }

  const database = decodeURIComponent(target.pathname.replace(/^\//, ""));
  const username = decodeURIComponent(target.username);
  const allowedQuery = [...target.searchParams.entries()].every(([key, value]) => key === "schema" && value === "public");

  if (
    target.protocol !== LOCAL_DEVELOPMENT_DATABASE.protocol ||
    target.hostname !== LOCAL_DEVELOPMENT_DATABASE.hostname ||
    target.port !== LOCAL_DEVELOPMENT_DATABASE.port ||
    database !== LOCAL_DEVELOPMENT_DATABASE.database ||
    username !== LOCAL_DEVELOPMENT_DATABASE.username ||
    !target.password ||
    !allowedQuery ||
    target.searchParams.getAll("schema").length > 1
  ) {
    throw new Error("DATABASE_URL must match the explicit local dealse_dev development database allowlist; no database changes were made.");
  }
}
