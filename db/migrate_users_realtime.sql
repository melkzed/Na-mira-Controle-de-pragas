-- Na Mira - reparo da tabela public.users para o cadastro de tecnicos.
-- Execute no SQL Editor do mesmo projeto Supabase usado pelo frontend.
-- Idempotente: pode ser executado mais de uma vez.

alter table public.users
  add column if not exists field_app_access boolean not null default false,
  add column if not exists permission_overrides jsonb;

-- O departamento e criado pela migracao de entity stores. So adiciona a FK
-- quando a tabela ja existir, evitando erro em projetos ainda na Fase 1.
do $$
begin
  if to_regclass('public.departments') is not null then
    alter table public.users
      add column if not exists department_id text;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'users_department_id_fkey'
        and conrelid = 'public.users'::regclass
    ) then
      alter table public.users
        add constraint users_department_id_fkey
        foreign key (department_id) references public.departments(id) on delete set null;
    end if;
  end if;
end $$;

-- Realtime e necessario para a lista de tecnicos atualizar em outras sessoes.
do $$
begin
  if to_regclass('public.users') is not null
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'users'
    ) then
    alter publication supabase_realtime add table public.users;
  end if;
end $$;
