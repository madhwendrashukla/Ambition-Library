export const DB_NAME = process.env.TEST_DB_NAME ?? "al_test";
const base = process.env.TEST_PG_BASE ?? "postgresql://postgres@localhost:54322";
const q = process.env.TEST_PG_QUERY ?? "?host=/tmp";
export const ADMIN_URL = `${base}/postgres${q}`;
export const TEST_URL = `${base}/${DB_NAME}${q}`;
