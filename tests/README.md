# Tests

There are three layers of tests. Run all three together with: `npm run test:all`

| Command | What it checks | Tests | Needs |
|---|---|---|---|
| `npm test` | Utility functions: phone format, dates, ₹ format, QR parsing, fee total, reminder text | 47 | Nothing |
| `npm run test:db` | Database: seat booking, every scan rule (QR, device, location, cooldown, shift, plan), who can see/change what (RLS), receipts, status, dashboard numbers, auto-OUT | 141 | Postgres |
| `npm run test:e2e` | Full flows in a real browser: login, admission, renew, payment, seat change, PIN reset, scan IN/OUT, dues reminder, settings, staff, mobile layout | 70 | Postgres + Chrome |

## Postgres setup (for DB and E2E tests)
Tests create a **fresh throw-away database** every run (`al_test`, `al_e2e`), so your real data is never touched.

Default connection: `postgresql://postgres@localhost:54322` (socket `/tmp`). To use your own Postgres, set these environment variables:
```bash
export TEST_PG_BASE="postgresql://postgres:password@localhost:5432"
export TEST_PG_QUERY=""          # leave empty to use TCP instead of the socket
```
Keep in mind: `tests/db/supabase-stub.sql` is only for plain Postgres. Never run it on a real Supabase project.

## E2E tests
```bash
npx playwright install chromium        # first time only
npm run test:e2e                        # builds the app and runs all tests
E2E_SKIP_BUILD=1 npm run test:e2e       # if already built (faster)
npx playwright test student.spec.ts     # just one file
CHROME_PATH=/usr/bin/google-chrome npm run test:e2e   # to use the system Chrome
```
- For E2E, `tests/e2e/supabase-mock.mjs` runs in place of Supabase: login, users, database API and storage. Queries run on Postgres with the real migrations and real RLS, so if the UI does something it doesn't have permission for, the test will fail.
- The app is built in a separate `.next-e2e` folder, so your real build isn't overwritten.
- On failure, screenshots and traces are in `test-results/`, and the HTML report is in `tests/e2e/report/`.

## Built a new feature?
- New database rule → add a test in `tests/db/` (each test runs in a transaction and is rolled back).
- New screen or flow → add it to `tests/e2e/*.spec.ts`.
