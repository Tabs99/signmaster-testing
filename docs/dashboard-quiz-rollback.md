# SignMaster — Dashboard & Quiz MVP Rollback Guide

How to undo the Dashboard + Quiz work, in whole or in part.

The feature is built as a set of self-contained file groups. Almost nothing
existing is rewritten, and no database migration is applied to the hosted
Supabase project without an explicit instruction to do so. So "undo" is mostly
"delete these paths", and any single group can come out without disturbing the
others.

---

## The file groups

| # | Group | Paths | Depends on |
| --- | --- | --- | --- |
| 1 | Sign content | `server/content/`, `server/scripts/buildSignsData.ts`, `public/signs/`, `build:signs` in `package.json` | — |
| 2 | Quiz logic | `server/quiz/` | 1 |
| 3 | Database | `supabase/migrations/20260922120000_quiz_progress.sql`, `supabase/rollback/` | — |
| 4 | API | `api/quiz/`, `api/progress/`, `server/services/quiz*.ts`, `src/lib/api/quizApi.ts`, `src/lib/api/progressApi.ts` | 2, 3 |
| 5 | App shell | `src/features/app/` | — |
| 6 | Dashboard | `src/features/dashboard/` | 4, 5 |
| 7 | Quiz screens | `src/features/quiz/` | 4, 5 |
| 8 | Landing page | `src/features/landing/` | — |
| 9 | Test updates | `e2e/quiz-flow.spec.ts`, `e2e/helpers/dashboardFixture.ts`, edits to existing specs | 5–8 |
| 10 | Local dev tooling | `server/dev/apiRoutesPlugin.ts`, `server/scripts/useHostedSupabase.ts`, `env:hosted` in `package.json`, edits to `vite.config.ts` and `playwright.config.ts` | — |

Groups 5 to 8 are presentational. Removing group 6, 7 or 8 also means removing
its route from `src/App.tsx`; nothing else refers to them.

---

## What this changed in existing code

Four things, all reversible on their own.

**`src/App.tsx`.** `/` used to redirect to `/activate` and now serves the
landing page; `/app` used to render a placeholder and now renders the dashboard;
`/app/quiz` is new. To restore the old redirect while keeping everything else:

```tsx
<Route path="/" element={<Navigate to="/activate" replace />} />
```

**`AppAccessScreen`.** The placeholder that `/app` used to render, along with
its test, was deleted once the dashboard replaced it — it had become
unreachable. Both files are intact in git history and can be restored with
`git checkout <commit> -- src/features/routing/components/AppAccessScreen.tsx`.

**The e2e specs.** They now import `test` from `e2e/helpers/dashboardFixture.ts`
instead of from `@playwright/test`, because every entitled path ends on the
dashboard and the dashboard asks the backend for progress before it renders.
The fixture answers that call with a first-run summary. Assertions that looked
for the placeholder's text or its `app-access` test id now look for the
dashboard. Reverting means putting the `@playwright/test` import back and
restoring those assertions.

**Local dev tooling (group 10).** Independent of the quiz feature and safe to
keep or drop on its own. `npm run dev` now serves the `api/` handlers through a
Vite plugin, because `vercel dev --local` does not build them unless the project
is linked to a Vercel account — without this, every backend call in development
returns module source and looks like a backend outage. The plugin also loads
`.env.local` into `process.env`, which Vite does not do, and never overwrites a
variable that is already set. `playwright.config.ts` relies on that last part:
it pins `SUPABASE_URL` and `SUPABASE_SECRET_KEY` at a dead local address so a
spec that forgets to mock a route cannot reach a real database. **If group 10 is
reverted, revert that `playwright.config.ts` change with it** — on its own it is
harmless, but the two belong together.

To drop group 10: delete the two files, remove `apiRoutesPlugin` from
`vite.config.ts`, remove `env:hosted` from `package.json`, restore the
`playwright.config.ts` env block, and put back the README section describing
`npm run dev` as frontend-only.

**`/activate` is untouched** — not moved, not renamed, not restyled. The QR code
printed on the cards, `https://signmastercards.co.uk/activate`, keeps working
under every combination of these groups, including a full revert.

---

## Undo everything

```bash
git checkout -- package.json src/App.tsx e2e/ vite.config.ts \
                playwright.config.ts README.md
git checkout <commit before this work> -- src/features/routing/
rm -rf server/content server/quiz server/scripts/buildSignsData.ts \
       public/signs api/quiz api/progress supabase/rollback \
       src/features/app src/features/dashboard src/features/quiz \
       src/features/landing src/lib/api/quizApi.ts src/lib/api/progressApi.ts \
       server/services/quizService.ts server/services/quizStore.ts \
       server/services/quizAccess.ts e2e/quiz-flow.spec.ts \
       server/dev server/scripts/useHostedSupabase.ts \
       docs/dashboard-quiz-rollback.md
rm -f supabase/migrations/20260922120000_quiz_progress.sql
```

If the work has already been merged, revert the merge instead of unpicking it:

```bash
git revert -m 1 <merge sha>
```

---

## Undo the database changes

Supabase migrations only run forwards, so the migration ships with a matching
rollback script under `supabase/rollback/`, named after the migration it undoes.

```bash
npx supabase db push                                    # apply
psql "$DATABASE_URL" -f supabase/rollback/20260922120000_quiz_progress.sql   # undo
```

The rollback script drops only `quiz_sessions`, `quiz_answers` and
`sign_progress`. It never touches `app_entitlements`, `activation_contexts`,
`activation_continuations`, `amazon_orders`, `amazon_order_items` or
`sync_state`, so undoing the quiz cannot affect a customer's purchase or their
access.

What a rollback destroys: every learner's quiz history and per-sign progress.
The activation data those accounts depend on lives in different tables and
survives untouched.

---

## Undo the artwork

Group 1 copies the client's sign artwork into `public/signs/`. The originals
stay in the client's delivery folder and the importer is repeatable, so the copy
can be recreated at any time:

```bash
npm run build:signs -- "<path to the Flash Cards - Mapping folder>"
```
