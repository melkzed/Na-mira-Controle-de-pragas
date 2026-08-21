-- ============================================================================
-- Na Mira · Controle de Pragas — bucket das fotos de atendimento.
--
-- Antes as fotos iam inteiras (base64) dentro da linha de `appointments`.
-- Funcionava, mas inchava o banco rápido: são várias fotos por visita, cada
-- uma de centenas de KB, e isso pesava em toda consulta e no Realtime. Agora
-- o arquivo vai pro Storage e só a URL fica gravada
-- (ver src/lib/photoStorage.ts).
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================================

-- Bucket público: as fotos aparecem na Agenda, no app do técnico e nos
-- relatórios impressos, e as URLs não são adivinháveis (nome é um UUID).
-- Se preferir fechar o acesso, troque `public` para false e passe a usar
-- `createSignedUrl` no lugar de `getPublicUrl` em src/lib/photoStorage.ts.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'atendimentos',
  'atendimentos',
  true,
  10485760,                                  -- 10 MB por arquivo
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Somente quem está autenticado envia/apaga; leitura é liberada (bucket
-- público). Idempotente: recria as políticas a cada execução.
drop policy if exists "atendimentos_insert" on storage.objects;
create policy "atendimentos_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'atendimentos');

drop policy if exists "atendimentos_update" on storage.objects;
create policy "atendimentos_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'atendimentos');

drop policy if exists "atendimentos_delete" on storage.objects;
create policy "atendimentos_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'atendimentos');

drop policy if exists "atendimentos_select" on storage.objects;
create policy "atendimentos_select" on storage.objects
  for select to public
  using (bucket_id = 'atendimentos');
