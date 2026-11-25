-- Phiên đang làm dở của từng bài, để tải lại trang, mất mạng hay đổi sang thiết bị khác vẫn học tiếp được.
-- session = {"run": {at, d}, "qrun": {at, d}, "bex": {at, d}}
--   run: lượt viết từ (phần 1), qrun: bài trắc nghiệm (phần 2), bex: bài tập sách đang mở (phần 3).
--   Mỗi phần gộp riêng: bản có "at" (mili giây) mới hơn thắng. d = null nghĩa là lượt đó đã xong.
-- Chạy file này trong SQL Editor của Supabase sau file 20261123000000_spell_quest.sql. Chạy lại nhiều lần vẫn an toàn.

alter table public.lesson_progress add column if not exists session jsonb not null default '{}'::jsonb;

create or replace function public.merge_session(cur jsonb, incoming jsonb, now_ms bigint)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with parts(k) as (values ('run'), ('qrun'), ('bex')),
  pick as (
    select p.k,
      case when jsonb_typeof(cur -> p.k) = 'object' and jsonb_typeof(cur -> p.k -> 'at') = 'number' then cur -> p.k end as a,
      case when jsonb_typeof(incoming -> p.k) = 'object'
             and jsonb_typeof(incoming -> p.k -> 'at') = 'number'
             and length((incoming -> p.k)::text) <= 100000
           then jsonb_build_object(
             'at', least(greatest(floor((incoming -> p.k ->> 'at')::numeric), 0), now_ms)::bigint,
             'd', coalesce(incoming -> p.k -> 'd', 'null'::jsonb))
      end as b
    from parts p
  )
  select coalesce(
    jsonb_object_agg(k, case when b is not null and (a is null or (b ->> 'at')::numeric > (a ->> 'at')::numeric) then b else a end)
      filter (where a is not null or b is not null),
    '{}'::jsonb)
  from pick;
$$;

revoke all on function public.merge_session(jsonb, jsonb, bigint) from public, anon;
grant execute on function public.merge_session(jsonb, jsonb, bigint) to authenticated, service_role;

create or replace function public.sync_progress(payload jsonb)
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

    insert into public.lesson_progress as t (user_id, lesson_id, best, quiz_best, book, book_at, wiped_at, session)
    values (
      uid, lid,
      greatest(coalesce((item ->> 'best')::integer, 0), 0),
      greatest(coalesce((item ->> 'quizBest')::integer, 0), 0),
      coalesce(item -> 'book', '{}'::jsonb),
      least(greatest(coalesce((item ->> 'bookAt')::bigint, 0), 0), now_ms),
      least(greatest(coalesce((item ->> 'wipedAt')::bigint, 0), 0), now_ms),
      public.merge_session('{}'::jsonb, item -> 'session', now_ms)
    )
    on conflict (user_id, lesson_id) do update set
      best = greatest(t.best, excluded.best),
      quiz_best = greatest(t.quiz_best, excluded.quiz_best),
      book = case when excluded.book_at > t.book_at then excluded.book else t.book end,
      book_at = greatest(t.book_at, excluded.book_at),
      wiped_at = greatest(t.wiped_at, excluded.wiped_at),
      session = public.merge_session(t.session, excluded.session, now_ms),
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
    'session', p.session,
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
