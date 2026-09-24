-- Undoes 20260922120000_quiz_progress.sql.
--
-- Drops only what that migration created. Nothing here touches amazon_orders,
-- amazon_order_items, app_entitlements, activation_contexts,
-- activation_continuations or sync_state, so running it cannot affect a
-- customer's purchase or their access to the app.
--
-- It does destroy every learner's quiz history and per-sign progress. There is
-- no way to rebuild that from the activation data.

drop table if exists public.quiz_answers;
drop table if exists public.sign_progress;
drop table if exists public.quiz_sessions;
