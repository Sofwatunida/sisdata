create unique index if not exists divisions_period_name_key
  on public.divisions (
    coalesce(period_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g')))
  );
