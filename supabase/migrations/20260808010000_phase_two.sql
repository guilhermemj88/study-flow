-- Study Flow phase 2: authenticated, user-isolated persistence.
-- Apply with `supabase db push` or paste this migration in the Supabase SQL editor.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subjects_id_user_unique unique (id, user_id)
);

create unique index subjects_user_name_unique
  on public.subjects (user_id, lower(name));

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint topics_id_user_unique unique (id, user_id),
  constraint topics_subject_owner_fk foreign key (subject_id, user_id)
    references public.subjects(id, user_id) on delete cascade
);

create unique index topics_user_subject_name_unique
  on public.topics (user_id, subject_id, lower(name));

create table public.study_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  target_exam_name text,
  exam_date date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_plans_id_user_unique unique (id, user_id)
);

create unique index one_active_plan_per_user
  on public.study_plans (user_id)
  where active;

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 180),
  source_type text not null check (source_type in ('exam', 'edital', 'other')),
  institution text,
  year integer check (year is null or year between 1900 and 2200),
  edition text,
  description text,
  storage_path text,
  original_filename text,
  mime_type text,
  file_size bigint check (file_size is null or file_size >= 0),
  analysis_status text not null default 'manual'
    check (analysis_status in ('pending', 'analyzed', 'error', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sources_id_user_unique unique (id, user_id)
);

create table public.study_plan_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  study_plan_id uuid not null,
  source_id uuid not null,
  use_for_incidence boolean not null default true,
  use_for_questions boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_plan_sources_id_user_unique unique (id, user_id),
  constraint study_plan_sources_plan_owner_fk foreign key (study_plan_id, user_id)
    references public.study_plans(id, user_id) on delete cascade,
  constraint study_plan_sources_source_owner_fk foreign key (source_id, user_id)
    references public.sources(id, user_id) on delete cascade,
  constraint study_plan_sources_unique unique (study_plan_id, source_id)
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  study_plan_id uuid,
  subject_id uuid not null,
  topic_id uuid not null,
  activity_type text not null
    check (activity_type in ('study', 'exercise', 'review', 'reinforcement')),
  scheduled_date date not null,
  estimated_minutes integer not null check (estimated_minutes > 0),
  question_count integer check (question_count is null or question_count > 0),
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'critical')),
  status text not null default 'planned'
    check (status in ('planned', 'attention', 'completed')),
  exercise_origin text not null default 'manual'
    check (exercise_origin in ('manual', 'question_bank')),
  linked_study_activity_id uuid,
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activities_id_user_unique unique (id, user_id),
  constraint activities_plan_owner_fk foreign key (study_plan_id, user_id)
    references public.study_plans(id, user_id) on delete set null (study_plan_id),
  constraint activities_subject_owner_fk foreign key (subject_id, user_id)
    references public.subjects(id, user_id) on delete restrict,
  constraint activities_topic_owner_fk foreign key (topic_id, user_id)
    references public.topics(id, user_id) on delete restrict,
  constraint activities_linked_study_owner_fk foreign key (linked_study_activity_id, user_id)
    references public.activities(id, user_id) on delete set null (linked_study_activity_id)
);

create table public.activity_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_id uuid not null,
  actual_minutes integer check (actual_minutes is null or actual_minutes > 0),
  questions_answered integer check (questions_answered is null or questions_answered >= 0),
  correct_answers integer check (correct_answers is null or correct_answers >= 0),
  wrong_answers integer check (wrong_answers is null or wrong_answers >= 0),
  accuracy numeric(5,2) check (accuracy is null or accuracy between 0 and 100),
  perceived_difficulty text not null
    check (perceived_difficulty in ('easy', 'normal', 'hard')),
  error_reasons text[] not null default '{}',
  study_methods text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activity_results_id_user_unique unique (id, user_id),
  constraint activity_results_activity_unique unique (activity_id),
  constraint activity_results_activity_owner_fk foreign key (activity_id, user_id)
    references public.activities(id, user_id) on delete cascade,
  constraint activity_result_question_totals check (
    questions_answered is null
    or coalesce(correct_answers, 0) + coalesce(wrong_answers, 0) = questions_answered
  )
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null,
  question_number integer not null check (question_number > 0),
  statement text not null check (char_length(trim(statement)) > 0),
  subject_id uuid,
  topic_id uuid,
  subtopic_text text,
  explanation text,
  correct_alternative text not null check (correct_alternative ~ '^[A-Z]$'),
  year integer check (year is null or year between 1900 and 2200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint questions_id_user_unique unique (id, user_id),
  constraint questions_source_number_unique unique (source_id, question_number),
  constraint questions_source_owner_fk foreign key (source_id, user_id)
    references public.sources(id, user_id) on delete cascade,
  constraint questions_subject_owner_fk foreign key (subject_id, user_id)
    references public.subjects(id, user_id) on delete set null (subject_id),
  constraint questions_topic_owner_fk foreign key (topic_id, user_id)
    references public.topics(id, user_id) on delete set null (topic_id)
);

create table public.question_alternatives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null,
  label text not null check (label ~ '^[A-Z]$'),
  text text not null check (char_length(trim(text)) > 0),
  sort_order integer not null check (sort_order >= 0),
  created_at timestamptz not null default now(),
  constraint question_alternatives_id_user_unique unique (id, user_id),
  constraint question_alternatives_question_label_unique unique (question_id, label),
  constraint question_alternatives_question_owner_fk foreign key (question_id, user_id)
    references public.questions(id, user_id) on delete cascade
);

create table public.question_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null,
  activity_id uuid,
  selected_alternative text not null check (selected_alternative ~ '^[A-Z]$'),
  correct boolean not null,
  error_reason text check (error_reason is null or error_reason in (
    'did_not_know', 'forgot', 'confused_concepts', 'interpretation', 'inattention', 'other'
  )),
  answered_at timestamptz not null default now(),
  constraint question_attempts_id_user_unique unique (id, user_id),
  constraint question_attempts_question_owner_fk foreign key (question_id, user_id)
    references public.questions(id, user_id) on delete cascade,
  constraint question_attempts_activity_owner_fk foreign key (activity_id, user_id)
    references public.activities(id, user_id) on delete set null (activity_id)
);

create table public.activity_error_details (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_id uuid not null,
  subject_id uuid not null,
  topic_id uuid,
  topic_text text,
  subtopic_text text,
  error_count integer not null check (error_count > 0),
  error_reason text not null check (error_reason in (
    'did_not_know', 'forgot', 'confused_concepts', 'interpretation', 'inattention', 'other'
  )),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activity_error_details_id_user_unique unique (id, user_id),
  constraint activity_error_details_activity_owner_fk foreign key (activity_id, user_id)
    references public.activities(id, user_id) on delete cascade,
  constraint activity_error_details_subject_owner_fk foreign key (subject_id, user_id)
    references public.subjects(id, user_id) on delete restrict,
  constraint activity_error_details_topic_owner_fk foreign key (topic_id, user_id)
    references public.topics(id, user_id) on delete set null (topic_id)
);

create table public.source_topic_stats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null,
  subject_id uuid not null,
  topic_id uuid,
  subtopic_text text,
  question_count integer not null default 0 check (question_count >= 0),
  incidence_percentage numeric(5,2) not null default 0
    check (incidence_percentage between 0 and 100),
  analysis_origin text not null default 'manual'
    check (analysis_origin in ('manual', 'mcp', 'imported')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint source_topic_stats_id_user_unique unique (id, user_id),
  constraint source_topic_stats_source_owner_fk foreign key (source_id, user_id)
    references public.sources(id, user_id) on delete cascade,
  constraint source_topic_stats_subject_owner_fk foreign key (subject_id, user_id)
    references public.subjects(id, user_id) on delete cascade,
  constraint source_topic_stats_topic_owner_fk foreign key (topic_id, user_id)
    references public.topics(id, user_id) on delete set null (topic_id)
);

create table public.exercise_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_id uuid,
  question_count integer not null check (question_count > 0),
  current_index integer not null default 0 check (current_index >= 0),
  correct_count integer not null default 0 check (correct_count >= 0),
  wrong_count integer not null default 0 check (wrong_count >= 0),
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'abandoned')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercise_sessions_id_user_unique unique (id, user_id),
  constraint exercise_sessions_activity_owner_fk foreign key (activity_id, user_id)
    references public.activities(id, user_id) on delete set null (activity_id)
);

create table public.exercise_session_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  question_id uuid not null,
  position integer not null check (position >= 0),
  selected_alternative text check (selected_alternative is null or selected_alternative ~ '^[A-Z]$'),
  correct boolean,
  error_reason text check (error_reason is null or error_reason in (
    'did_not_know', 'forgot', 'confused_concepts', 'interpretation', 'inattention', 'other'
  )),
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercise_session_questions_id_user_unique unique (id, user_id),
  constraint exercise_session_position_unique unique (session_id, position),
  constraint exercise_session_question_unique unique (session_id, question_id),
  constraint exercise_session_questions_session_owner_fk foreign key (session_id, user_id)
    references public.exercise_sessions(id, user_id) on delete cascade,
  constraint exercise_session_questions_question_owner_fk foreign key (question_id, user_id)
    references public.questions(id, user_id) on delete cascade
);

-- Query and RLS indexes.
create index subjects_user_idx on public.subjects(user_id);
create index topics_user_subject_idx on public.topics(user_id, subject_id);
create index study_plans_user_idx on public.study_plans(user_id);
create index sources_user_created_idx on public.sources(user_id, created_at desc);
create index study_plan_sources_user_plan_idx on public.study_plan_sources(user_id, study_plan_id);
create index activities_user_date_idx on public.activities(user_id, scheduled_date);
create index activities_user_subject_idx on public.activities(user_id, subject_id, topic_id);
create index activity_results_user_idx on public.activity_results(user_id);
create index questions_user_source_idx on public.questions(user_id, source_id);
create index questions_user_subject_topic_idx on public.questions(user_id, subject_id, topic_id);
create index question_alternatives_user_question_idx on public.question_alternatives(user_id, question_id);
create index question_attempts_user_question_idx on public.question_attempts(user_id, question_id, answered_at desc);
create index question_attempts_user_answered_idx on public.question_attempts(user_id, answered_at desc);
create index activity_error_details_user_activity_idx on public.activity_error_details(user_id, activity_id);
create index activity_error_details_user_topic_idx on public.activity_error_details(user_id, subject_id, topic_id);
create index source_topic_stats_user_source_idx on public.source_topic_stats(user_id, source_id);
create index exercise_sessions_user_status_idx on public.exercise_sessions(user_id, status, created_at desc);
create index exercise_session_questions_user_session_idx on public.exercise_session_questions(user_id, session_id, position);

-- Keep updated_at consistent in every mutable table.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'subjects', 'topics', 'study_plans', 'sources',
    'study_plan_sources', 'activities', 'activity_results', 'questions',
    'activity_error_details', 'source_topic_stats', 'exercise_sessions',
    'exercise_session_questions'
  ] loop
    execute format(
      'create trigger set_%1$s_updated_at before update on public.%1$I for each row execute function public.set_updated_at()',
      table_name
    );
  end loop;
end $$;

-- New accounts receive a private profile and a default active plan.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''))
  on conflict (id) do nothing;

  insert into public.study_plans (user_id, name, active)
  values (new.id, 'Meu plano', true)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Existing Auth users also receive the required profile/default plan.
insert into public.profiles (id, display_name)
select id, nullif(trim(raw_user_meta_data ->> 'display_name'), '')
from auth.users
on conflict (id) do nothing;

insert into public.study_plans (user_id, name, active)
select id, 'Meu plano', true
from auth.users users
where not exists (
  select 1 from public.study_plans plans where plans.user_id = users.id and plans.active
);

-- RLS: every exposed personal table is denied by default and restricted to auth.uid().
alter table public.profiles enable row level security;
alter table public.profiles force row level security;

create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = id);
create policy "profiles_delete_own" on public.profiles
  for delete to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = id);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'subjects', 'topics', 'study_plans', 'sources', 'study_plan_sources',
    'activities', 'activity_results', 'questions', 'question_alternatives',
    'question_attempts', 'activity_error_details', 'source_topic_stats',
    'exercise_sessions', 'exercise_session_questions'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select auth.uid()) is not null and (select auth.uid()) = user_id)',
      table_name || '_select_own', table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) is not null and (select auth.uid()) = user_id)',
      table_name || '_insert_own', table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select auth.uid()) is not null and (select auth.uid()) = user_id) with check ((select auth.uid()) is not null and (select auth.uid()) = user_id)',
      table_name || '_update_own', table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select auth.uid()) is not null and (select auth.uid()) = user_id)',
      table_name || '_delete_own', table_name
    );
  end loop;
end $$;

-- Limit grants to Study Flow tables; do not change unrelated tables in an existing project.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'subjects', 'topics', 'study_plans', 'sources',
    'study_plan_sources', 'activities', 'activity_results', 'questions',
    'question_alternatives', 'question_attempts', 'activity_error_details',
    'source_topic_stats', 'exercise_sessions', 'exercise_session_questions'
  ] loop
    execute format('revoke all on public.%I from anon', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
  end loop;
end $$;

-- Private source files. The first path segment must always be the authenticated user id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'study-sources',
  'study-sources',
  false,
  20971520,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "source_files_select_own"
on storage.objects for select to authenticated
using (
  bucket_id = 'study-sources'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "source_files_insert_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'study-sources'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "source_files_update_own"
on storage.objects for update to authenticated
using (
  bucket_id = 'study-sources'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'study-sources'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "source_files_delete_own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'study-sources'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
