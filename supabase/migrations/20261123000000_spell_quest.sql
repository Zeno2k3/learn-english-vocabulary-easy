-- Spell Quest: nội dung bài học (chỉ đổi khi git push) và tiến độ học của từng tài khoản.

create table public.topics (
  id text primary key,
  vi text not null,
  position integer not null default 0,
  data jsonb not null
);

create table public.lessons (
  id integer primary key check (id > 0),
  title text not null,
  base text not null,
  content jsonb not null,
  content_hash text not null,
  published_at timestamptz not null default now()
);

create table public.words (
  lesson_id integer not null references public.lessons (id) on delete cascade,
  word_key text not null,
  w text not null,
  vi text not null,
  t text not null,
  topic text not null,
  ipa text,
  position integer not null default 0,
  data jsonb not null,
  primary key (lesson_id, word_key)
);
create index words_topic_idx on public.words (topic);

-- Tiến độ không khoá ngoại tới lessons: tạm gỡ một bài khỏi Git không làm mất tiến độ của bài đó.
create table public.lesson_progress (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lesson_id integer not null check (lesson_id > 0),
  best integer not null default 0 check (best >= 0),
  quiz_best integer not null default 0 check (quiz_best >= 0),
  book jsonb not null default '{}'::jsonb,
  book_at bigint not null default 0,
  wiped_at bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create table public.word_stats (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lesson_id integer not null check (lesson_id > 0),
  word_key text not null,
  w text not null,
  wrong integer not null default 0 check (wrong >= 0),
  right_count integer not null default 0 check (right_count >= 0),
  streak integer not null default 0 check (streak >= 0),
  last_at bigint not null default 0,
  last_wrong bigint not null default 0,
  primary key (user_id, lesson_id, word_key)
);

alter table public.topics enable row level security;
alter table public.lessons enable row level security;
alter table public.words enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.word_stats enable row level security;

create policy "content is readable" on public.topics for select to anon, authenticated using (true);
create policy "content is readable" on public.lessons for select to anon, authenticated using (true);
create policy "content is readable" on public.words for select to anon, authenticated using (true);
create policy "own progress" on public.lesson_progress for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own word stats" on public.word_stats for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.topics, public.lessons, public.words, public.lesson_progress, public.word_stats from public, anon, authenticated;
grant select on public.topics, public.lessons, public.words to anon, authenticated;
grant select, insert, update, delete on public.lesson_progress, public.word_stats to authenticated;
grant all on public.topics, public.lessons, public.words, public.lesson_progress, public.word_stats to service_role;

-- Gộp tiến độ ngay trong database để hai thiết bị ghi cùng lúc không đè mất dữ liệu của nhau.
create function public.sync_progress(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  item jsonb;
  lid integer;
  cut bigint;
  result jsonb;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  for item in select value from jsonb_array_elements(coalesce(payload -> 'lessons', '[]'::jsonb)) loop
    lid := (item ->> 'id')::integer;

    insert into public.lesson_progress as t (user_id, lesson_id, best, quiz_best, book, book_at, wiped_at)
    values (
      uid, lid,
      greatest(coalesce((item ->> 'best')::integer, 0), 0),
      greatest(coalesce((item ->> 'quizBest')::integer, 0), 0),
      coalesce(item -> 'book', '{}'::jsonb),
      least(greatest(coalesce((item ->> 'bookAt')::bigint, 0), 0), now_ms),
      least(greatest(coalesce((item ->> 'wipedAt')::bigint, 0), 0), now_ms)
    )
    on conflict (user_id, lesson_id) do update set
      best = greatest(t.best, excluded.best),
      quiz_best = greatest(t.quiz_best, excluded.quiz_best),
      book = case when excluded.book_at > t.book_at then excluded.book else t.book end,
      book_at = greatest(t.book_at, excluded.book_at),
      wiped_at = greatest(t.wiped_at, excluded.wiped_at),
      updated_at = now()
    returning t.wiped_at into cut;

    delete from public.word_stats s where s.user_id = uid and s.lesson_id = lid and s.last_at <= cut;

    insert into public.word_stats as t (user_id, lesson_id, word_key, w, wrong, right_count, streak, last_at, last_wrong)
    select
      uid, lid, e.key, e.value ->> 'w',
      greatest(coalesce((e.value ->> 'wrong')::integer, 0), 0),
      greatest(coalesce((e.value ->> 'right')::integer, 0), 0),
      greatest(coalesce((e.value ->> 'streak')::integer, 0), 0),
      least(coalesce((e.value ->> 'last')::bigint, 0), now_ms),
      least(coalesce((e.value ->> 'lastWrong')::bigint, 0), now_ms)
    from jsonb_each(coalesce(item -> 'stats', '{}'::jsonb)) e
    where e.value ->> 'w' is not null
      and least(coalesce((e.value ->> 'last')::bigint, 0), now_ms) > cut
    on conflict (user_id, lesson_id, word_key) do update set
      w = case when excluded.last_at >= t.last_at then excluded.w else t.w end,
      wrong = greatest(t.wrong, excluded.wrong),
      right_count = greatest(t.right_count, excluded.right_count),
      streak = case when excluded.last_at >= t.last_at then excluded.streak else t.streak end,
      last_at = greatest(t.last_at, excluded.last_at),
      last_wrong = greatest(t.last_wrong, excluded.last_wrong);
  end loop;

  select jsonb_build_object('lessons', coalesce(jsonb_agg(jsonb_build_object(
    'id', p.lesson_id,
    'best', p.best,
    'quizBest', p.quiz_best,
    'book', p.book,
    'bookAt', p.book_at,
    'wipedAt', p.wiped_at,
    'stats', coalesce((
      select jsonb_object_agg(s.word_key, jsonb_build_object(
        'w', s.w, 'wrong', s.wrong, 'right', s.right_count, 'streak', s.streak, 'last', s.last_at, 'lastWrong', s.last_wrong
      ))
      from public.word_stats s
      where s.user_id = uid and s.lesson_id = p.lesson_id
    ), '{}'::jsonb)
  )), '[]'::jsonb))
  into result
  from public.lesson_progress p
  where p.user_id = uid;

  return result;
end;
$$;

-- Chỉ GitHub Actions (khoá bí mật) được gọi: ghi đúng trạng thái của Git vào database.
create function public.publish_content(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  lid integer;
  changed integer := 0;
  removed integer := 0;
begin
  if jsonb_typeof(payload -> 'lessons') is distinct from 'array'
     or jsonb_array_length(payload -> 'lessons') = 0
     or jsonb_typeof(payload -> 'topics') is distinct from 'array' then
    raise exception 'payload must contain lessons and topics';
  end if;

  insert into public.topics (id, vi, position, data)
  select x.v ->> 'id', x.v ->> 'vi', (x.o - 1)::integer, x.v
  from jsonb_array_elements(payload -> 'topics') with ordinality as x(v, o)
  on conflict (id) do update set vi = excluded.vi, position = excluded.position, data = excluded.data;

  delete from public.topics t
  where not exists (select 1 from jsonb_array_elements(payload -> 'topics') as x(v) where x.v ->> 'id' = t.id);

  with gone as (
    delete from public.lessons l
    where not exists (select 1 from jsonb_array_elements(payload -> 'lessons') as x(v) where (x.v ->> 'id')::integer = l.id)
    returning 1
  )
  select count(*) into removed from gone;

  for item in select value from jsonb_array_elements(payload -> 'lessons') loop
    lid := (item ->> 'id')::integer;
    continue when exists (select 1 from public.lessons l where l.id = lid and l.content_hash = item ->> 'hash');

    insert into public.lessons (id, title, base, content, content_hash, published_at)
    values (lid, item ->> 'title', item ->> 'base', item -> 'content', item ->> 'hash', now())
    on conflict (id) do update set
      title = excluded.title, base = excluded.base, content = excluded.content,
      content_hash = excluded.content_hash, published_at = excluded.published_at;

    delete from public.words w where w.lesson_id = lid;
    insert into public.words (lesson_id, word_key, w, vi, t, topic, ipa, position, data)
    select lid, x.v ->> 'key', x.v ->> 'w', x.v ->> 'vi', x.v ->> 't', x.v ->> 'topic', x.v ->> 'ipa', (x.o - 1)::integer, x.v -> 'data'
    from jsonb_array_elements(item -> 'words') with ordinality as x(v, o);
    changed := changed + 1;
  end loop;

  return jsonb_build_object('changed', changed, 'removed', removed, 'total', jsonb_array_length(payload -> 'lessons'));
end;
$$;

revoke all on function public.sync_progress(jsonb) from public, anon, authenticated;
grant execute on function public.sync_progress(jsonb) to authenticated;
revoke all on function public.publish_content(jsonb) from public, anon, authenticated;
grant execute on function public.publish_content(jsonb) to service_role;
