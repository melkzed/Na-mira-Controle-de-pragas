-- ============================================================================
-- Na Mira · Controle de Pragas — Fase 2, último lote: Auditoria (auditStore),
-- Perfil da empresa (orgProfileStore) e Configurações/assinaturas/fiscal
-- (settingsStore).
--
-- Diferente dos lotes anteriores, orgProfileStore e settingsStore são
-- SINGLETONS (uma linha por organização, sem lista/CRUD) — mapeiam pra
-- organizations e fiscal_settings respectivamente, cada uma com update
-- direto (sem add/remove).
--
-- Rodar no SQL Editor do Supabase, depois de db/migrate_ids_to_text.sql.
-- Idempotente.
-- ============================================================================

-- ── audit_logs: id/entity_id gerados no cliente (mesmo motivo de sempre —
--    entity_id em particular referencia ids de QUALQUER entidade do app,
--    formatos variados, nunca poderia ser uuid). ───────────────────────────
alter table public.audit_logs alter column id type text using id::text;
alter table public.audit_logs alter column id set default gen_random_uuid()::text;
alter table public.audit_logs alter column entity_id type text using entity_id::text;
alter table public.audit_logs add column if not exists user_name text;
alter table public.audit_logs add column if not exists description text;

-- ── organizations: completa os campos do perfil da empresa (OrgProfile)
--    que ainda não existiam. ────────────────────────────────────────────
alter table public.organizations
  add column if not exists tax_regime                       text,
  add column if not exists municipal_registration            text,
  add column if not exists state_registration                text,
  add column if not exists street                            text,
  add column if not exists district                          text,
  add column if not exists city                              text,
  add column if not exists state                             text,
  add column if not exists cep                                text,
  add column if not exists logo_data_url                      text,
  add column if not exists technical_responsible_name         text,
  add column if not exists technical_responsible_role         text,
  add column if not exists technical_responsible_registry     text;

-- ── fiscal_settings: completa FiscalConfig por inteiro (provider, ambiente,
--    NFS-e Nacional/Focus NFe, retenções) e o restante do settingsStore
--    (assinaturas eletrônicas, emergência/CIT) — tudo persistido junto no
--    app hoje sob a mesma chave de localStorage, então mantém junto aqui. ──
alter table public.fiscal_settings
  add column if not exists provider                     text default 'simulado',
  add column if not exists backend_url                  text,
  add column if not exists environment                  text default 'homologacao',
  add column if not exists municipio_ibge               text,
  add column if not exists item_lista_servico            text,
  add column if not exists codigo_tributario_municipal   text,
  add column if not exists regime                        text,
  add column if not exists iss_retido                    boolean default false,
  add column if not exists retencoes                     boolean default false,
  add column if not exists inss_retido                   boolean default false,
  add column if not exists irrf_rate                     numeric(6,3),
  add column if not exists company_signature             text,
  add column if not exists signatures                    jsonb default '{}'::jsonb,
  add column if not exists emergency_phone               text,
  add column if not exists emergency_info                text;

do $$
declare
  t text;
begin
  foreach t in array array['audit_logs', 'organizations', 'fiscal_settings']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Lembrete: rode db/rls.sql de novo depois (organizations e fiscal_settings
-- já tinham política própria — org_self / staff_only —, só audit_logs
-- depende da varredura genérica de org_isolation, sem novidade aqui).
