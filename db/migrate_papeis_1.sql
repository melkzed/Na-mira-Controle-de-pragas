-- ============================================================================
-- Na Mira · Controle de Pragas — papéis, PARTE 1 de 2
--
-- Cria os valores novos do tipo `user_role`. Só isso.
--
-- Rode este arquivo INTEIRO e espere terminar. Depois rode
-- db/migrate_papeis_2.sql, que é quem usa os valores criados aqui.
--
-- Por que em dois arquivos: o PostgreSQL não permite USAR um valor de enum
-- na mesma transação em que ele foi criado ("unsafe use of new value"). O
-- SQL Editor do Supabase executa cada envio dentro de uma transação, então
-- os dois passos precisam ser envios separados.
-- ============================================================================

alter type user_role add value if not exists 'funcionario';
alter type user_role add value if not exists 'cliente';
