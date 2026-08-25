-- ============================================================================
-- Na Mira · Controle de Pragas — ações do técnico em campo.
--   · Assinatura do cliente capturada na visita (antes só existia na OS).
--   · Verificação do local (checklist MIP) registrada na visita.
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================================

alter table public.appointments
  add column if not exists customer_signature text,
  add column if not exists verification jsonb;

notify pgrst, 'reload schema';
