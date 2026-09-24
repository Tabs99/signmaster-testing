-- Quiz sessions, answers and per-sign learning progress.
--
-- Scoring is server-authoritative: a quiz's questions are chosen and recorded
-- when it starts, and the submitted answers are scored against that record by
-- the service role. Nothing here is writable by the learner, so a tampered
-- request can change what they see but never what the app believes they know.

create table public.quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  -- 1-based, per learner. Drives the spacing rules in the selection scheduler.
  quiz_index integer not null,
  -- The signs asked, in order. Written at start, never changed.
  sign_ids text[] not null,
  total_questions integer not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  score integer,
  constraint quiz_sessions_quiz_index_positive
    check (quiz_index >= 1),
  constraint quiz_sessions_total_questions_positive
    check (total_questions >= 1),
  constraint quiz_sessions_sign_ids_match_total
    check (cardinality(sign_ids) = total_questions),
  constraint quiz_sessions_score_within_total
    check (score is null or (score >= 0 and score <= total_questions)),
  -- A session is either in progress with no score, or finished with one.
  constraint quiz_sessions_score_accompanies_completion
    check ((completed_at is null) = (score is null)),
  constraint quiz_sessions_one_index_per_user
    unique (user_id, quiz_index)
);

create index quiz_sessions_user_started_idx
  on public.quiz_sessions (user_id, started_at desc);

create index quiz_sessions_user_completed_idx
  on public.quiz_sessions (user_id, completed_at desc)
  where completed_at is not null;

create table public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  quiz_session_id uuid not null
    references public.quiz_sessions (id) on delete cascade,
  -- Denormalised so a learner's answers can be read without joining, and so
  -- the select-own policy below does not depend on the parent row.
  user_id uuid not null references auth.users (id),
  sign_id text not null,
  -- 0-based position within the quiz.
  question_index integer not null,
  -- Null when the quiz was submitted with this question left unanswered.
  chosen_option_index integer,
  correct_option_index integer not null,
  is_correct boolean not null,
  answered_at timestamptz not null default now(),
  constraint quiz_answers_question_index_non_negative
    check (question_index >= 0),
  constraint quiz_answers_chosen_option_in_range
    check (chosen_option_index is null
           or (chosen_option_index >= 0 and chosen_option_index <= 3)),
  constraint quiz_answers_correct_option_in_range
    check (correct_option_index >= 0 and correct_option_index <= 3),
  -- Correctness is a fact about the two indexes, not an independent claim.
  constraint quiz_answers_is_correct_matches_choice
    check (is_correct = (chosen_option_index is not distinct from correct_option_index)),
  constraint quiz_answers_one_per_question
    unique (quiz_session_id, question_index)
);

create index quiz_answers_user_sign_idx
  on public.quiz_answers (user_id, sign_id);

-- One row per learner per sign they have been asked about. Signs with no row
-- have never been seen, which is what makes an unseen sign cheap to find.
create table public.sign_progress (
  user_id uuid not null references auth.users (id),
  sign_id text not null,
  times_seen integer not null default 0,
  times_correct integer not null default 0,
  times_incorrect integer not null default 0,
  -- Consecutive correct answers. Any wrong answer resets it to zero, which is
  -- what moves a sign back to Needs Practice on the dashboard.
  streak integer not null default 0,
  last_quiz_index integer not null default 0,
  -- Set when the sign is missed, cleared when it is answered correctly.
  review_due_quiz_index integer,
  updated_at timestamptz not null default now(),
  primary key (user_id, sign_id),
  constraint sign_progress_times_seen_non_negative
    check (times_seen >= 0),
  constraint sign_progress_times_correct_non_negative
    check (times_correct >= 0),
  constraint sign_progress_times_incorrect_non_negative
    check (times_incorrect >= 0),
  constraint sign_progress_streak_non_negative
    check (streak >= 0),
  constraint sign_progress_attempts_match_seen
    check (times_correct + times_incorrect = times_seen),
  constraint sign_progress_streak_within_correct
    check (streak <= times_correct)
);

create index sign_progress_user_review_due_idx
  on public.sign_progress (user_id, review_due_quiz_index)
  where review_due_quiz_index is not null;

alter table public.quiz_sessions enable row level security;
alter table public.quiz_answers enable row level security;
alter table public.sign_progress enable row level security;

revoke all privileges on table public.quiz_sessions
  from anon, authenticated, service_role;

revoke all privileges on table public.quiz_answers
  from anon, authenticated, service_role;

revoke all privileges on table public.sign_progress
  from anon, authenticated, service_role;

-- Learners may read their own history and nothing else. Every write goes
-- through the API under the service role.
create policy quiz_sessions_select_own
  on public.quiz_sessions
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy quiz_answers_select_own
  on public.quiz_answers
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy sign_progress_select_own
  on public.sign_progress
  for select
  to authenticated
  using (auth.uid() = user_id);

grant select on table public.quiz_sessions to authenticated;
grant select on table public.quiz_answers to authenticated;
grant select on table public.sign_progress to authenticated;

grant select, insert, update on table public.quiz_sessions to service_role;
grant select, insert on table public.quiz_answers to service_role;
grant select, insert, update on table public.sign_progress to service_role;
