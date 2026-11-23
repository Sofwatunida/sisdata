create or replace function public.restore_app_snapshot(p_snapshot jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'Snapshot harus berupa object JSON';
  end if;

  if jsonb_typeof(p_snapshot->'import_rows') = 'array' then delete from public.import_rows; end if;
  if jsonb_typeof(p_snapshot->'import_batches') = 'array' then delete from public.import_batches; end if;
  if jsonb_typeof(p_snapshot->'activity_logs') = 'array' then delete from public.activity_logs; end if;
  if jsonb_typeof(p_snapshot->'operator_permissions') = 'array' then delete from public.operator_permissions; end if;
  if jsonb_typeof(p_snapshot->'assignments') = 'array' then delete from public.assignments; end if;
  if jsonb_typeof(p_snapshot->'work_assignments') = 'array' then delete from public.work_assignments; end if;
  if jsonb_typeof(p_snapshot->'supervisors') = 'array' then delete from public.supervisors; end if;
  if jsonb_typeof(p_snapshot->'personnel') = 'array' then delete from public.personnel; end if;
  if jsonb_typeof(p_snapshot->'divisions') = 'array' then delete from public.divisions; end if;
  if jsonb_typeof(p_snapshot->'master_data') = 'array' then delete from public.master_data; end if;
  if jsonb_typeof(p_snapshot->'settings') = 'array' then delete from public.settings; end if;
  if jsonb_typeof(p_snapshot->'periods') = 'array' then delete from public.periods; end if;
  if jsonb_typeof(p_snapshot->'profiles') = 'array' then delete from public.profiles; end if;

  if jsonb_typeof(p_snapshot->'periods') = 'array' then
    insert into public.periods select * from jsonb_populate_recordset(null::public.periods, p_snapshot->'periods');
  end if;
  if jsonb_typeof(p_snapshot->'profiles') = 'array' then
    insert into public.profiles select * from jsonb_populate_recordset(null::public.profiles, p_snapshot->'profiles');
  end if;
  if jsonb_typeof(p_snapshot->'master_data') = 'array' then
    insert into public.master_data select * from jsonb_populate_recordset(null::public.master_data, p_snapshot->'master_data');
  end if;
  if jsonb_typeof(p_snapshot->'divisions') = 'array' then
    insert into public.divisions select * from jsonb_populate_recordset(null::public.divisions, p_snapshot->'divisions');
  end if;
  if jsonb_typeof(p_snapshot->'personnel') = 'array' then
    insert into public.personnel select * from jsonb_populate_recordset(null::public.personnel, p_snapshot->'personnel');
  end if;
  if jsonb_typeof(p_snapshot->'supervisors') = 'array' then
    insert into public.supervisors select * from jsonb_populate_recordset(null::public.supervisors, p_snapshot->'supervisors');
  end if;
  if jsonb_typeof(p_snapshot->'assignments') = 'array' then
    insert into public.assignments select * from jsonb_populate_recordset(null::public.assignments, p_snapshot->'assignments');
  end if;
  if jsonb_typeof(p_snapshot->'work_assignments') = 'array' then
    insert into public.work_assignments select * from jsonb_populate_recordset(null::public.work_assignments, p_snapshot->'work_assignments');
  end if;
  if jsonb_typeof(p_snapshot->'settings') = 'array' then
    insert into public.settings select * from jsonb_populate_recordset(null::public.settings, p_snapshot->'settings');
  end if;
  if jsonb_typeof(p_snapshot->'operator_permissions') = 'array' then
    insert into public.operator_permissions select * from jsonb_populate_recordset(null::public.operator_permissions, p_snapshot->'operator_permissions');
  end if;
  if jsonb_typeof(p_snapshot->'activity_logs') = 'array' then
    insert into public.activity_logs select * from jsonb_populate_recordset(null::public.activity_logs, p_snapshot->'activity_logs');
  end if;
  if jsonb_typeof(p_snapshot->'import_batches') = 'array' then
    insert into public.import_batches select * from jsonb_populate_recordset(null::public.import_batches, p_snapshot->'import_batches');
  end if;
  if jsonb_typeof(p_snapshot->'import_rows') = 'array' then
    insert into public.import_rows select * from jsonb_populate_recordset(null::public.import_rows, p_snapshot->'import_rows');
  end if;
end;
$$;

revoke all on function public.restore_app_snapshot(jsonb) from public, anon, authenticated;
grant execute on function public.restore_app_snapshot(jsonb) to service_role;
