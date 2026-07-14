-- ============================================================================
-- Na Mira · Controle de Pragas — dados de exemplo (seed)
-- Aplicar após db/schema.sql. UUIDs fixos para relacionamentos determinísticos.
-- ============================================================================

-- Organização
insert into organizations (id, name, legal_name, cnpj, email, address) values
  ('00000000-0000-0000-0000-000000000001',
   'Na Mira Controle de Pragas',
   'Na Mira Serviços de Dedetização Ltda',
   '41.222.333/0001-44',
   'contato@namira.com',
   '{"cidade":"São Paulo","uf":"SP"}');

-- Usuários
insert into users (id, org_id, name, email, role, phone) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000001','Marina Duarte','marina@namira.com','admin','(11) 99999-0001'),
  ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-000000000001','Rafael Nunes','rafael@namira.com','supervisor','(11) 99999-0002'),
  ('00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-000000000001','Camila Reis','camila@namira.com','financeiro','(11) 99999-0003'),
  ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-000000000001','Diego Almeida','diego@namira.com','tecnico','(11) 98888-1001'),
  ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-000000000001','Bruno Carvalho','bruno@namira.com','tecnico','(11) 98888-1002'),
  ('00000000-0000-0000-0000-0000000000b3','00000000-0000-0000-0000-000000000001','Paula Freitas','paula@namira.com','tecnico','(11) 98888-1003');

-- Equipes
insert into teams (id, org_id, name, leader_id, color) values
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-000000000001','Equipe Alfa','00000000-0000-0000-0000-0000000000b1','#10b981'),
  ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-000000000001','Equipe Beta','00000000-0000-0000-0000-0000000000b3','#6366f1');

insert into team_members (team_id, user_id) values
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000b3');

-- Tipos de serviço
insert into service_types (id, org_id, name, default_duration_min, default_price, color) values
  ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000000001','Dedetização',90,320,'#10b981'),
  ('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-000000000001','Desratização',75,280,'#6366f1'),
  ('00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-000000000001','Sanitização',60,240,'#0ea5e9'),
  ('00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-000000000001','Descupinização',120,540,'#f59e0b');

insert into pests (id, org_id, name) values
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-000000000001','Baratas'),
  ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-000000000001','Ratos'),
  ('00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-000000000001','Cupins'),
  ('00000000-0000-0000-0000-0000000000e4','00000000-0000-0000-0000-000000000001','Formigas');

-- Fornecedores e categorias
insert into suppliers (id, org_id, name, document, phone) values
  ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000001','BioControl Distribuidora','12.345.678/0001-90','(11) 3000-1000'),
  ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-000000000001','AgroPrag Insumos','98.765.432/0001-10','(11) 3000-2000');

insert into product_categories (id, org_id, name) values
  ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000001','Inseticidas'),
  ('00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000001','Rodenticidas'),
  ('00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000001','Cupinicidas'),
  ('00000000-0000-0000-0000-000000000104','00000000-0000-0000-0000-000000000001','EPIs / Insumos');

-- Produtos
insert into products (id, org_id, name, category_id, manufacturer, supplier_id, registration_code, active_ingredient, application_type, dosage, unit, min_quantity, price, storage_location, is_regulated) values
  ('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000001','K-Othrine SC 25','00000000-0000-0000-0000-000000000101','Bayer','00000000-0000-0000-0000-0000000000f1','MS 3.0294.0001','Deltametrina','Pulverização','20ml/L','L',5,189.90,'A1',true),
  ('00000000-0000-0000-0000-000000000202','00000000-0000-0000-0000-000000000001','Klerat Blocos','00000000-0000-0000-0000-000000000102','Syngenta','00000000-0000-0000-0000-0000000000f1','MS 2.0154.0002','Brodifacoum','Isca','1 bloco/PEA','kg',3,96.50,'B2',true),
  ('00000000-0000-0000-0000-000000000203','00000000-0000-0000-0000-000000000001','Fipronil Gel Barata','00000000-0000-0000-0000-000000000101','BASF','00000000-0000-0000-0000-0000000000f2','MS 3.1055.0007','Fipronil','Gel','pontos 0,5g','un',10,74.00,'A3',true),
  ('00000000-0000-0000-0000-000000000204','00000000-0000-0000-0000-000000000001','Premise 200 SC','00000000-0000-0000-0000-000000000103','Bayer','00000000-0000-0000-0000-0000000000f1','MS 3.0294.0033','Imidacloprido','Injeção','10ml/L','L',4,264.00,'C1',true),
  ('00000000-0000-0000-0000-000000000205','00000000-0000-0000-0000-000000000001','Luva Nitrílica','00000000-0000-0000-0000-000000000104','Volk','00000000-0000-0000-0000-0000000000f2',null,null,null,null,'par',20,9.50,'E2',false);

-- Lotes
insert into product_batches (id, org_id, product_id, batch_code, expires_at) values
  ('00000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000203','FG-2405', current_date + 18),
  ('00000000-0000-0000-0000-000000000302','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000202','KL-2401', current_date + 9);

-- Locais de estoque (central + técnicos)
insert into stock_locations (id, org_id, kind, name, owner_id) values
  ('00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000001','central','Estoque Central',null),
  ('00000000-0000-0000-0000-000000000402','00000000-0000-0000-0000-000000000001','tecnico','Estoque · Diego Almeida','00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-000000000403','00000000-0000-0000-0000-000000000001','tecnico','Estoque · Bruno Carvalho','00000000-0000-0000-0000-0000000000b2');

-- Saldos
insert into stock_balances (org_id, location_id, product_id, quantity) values
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000201',18),
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000202',2),
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000203',24),
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000402','00000000-0000-0000-0000-000000000201',4),
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000403','00000000-0000-0000-0000-000000000202',3);

-- Clientes
insert into customers (id, org_id, type, name, company_name, document, phone, whatsapp, email, city, state, district, street, number, cep, latitude, longitude, property_type, area_m2, tags) values
  ('00000000-0000-0000-0000-000000000501','00000000-0000-0000-0000-000000000001','pj','Padaria Pão Quente','Pão Quente Ltda','12.345.678/0001-99','(11) 3011-1000','(11) 99011-1000','contato@paoquente.com','São Paulo','SP','Pinheiros','Rua dos Pinheiros','820','05422-001',-23.5629,-46.6825,'Comercial',220,'{"Contrato mensal","Alimentício"}'),
  ('00000000-0000-0000-0000-000000000502','00000000-0000-0000-0000-000000000001','pf','Helena Martins',null,'123.456.789-00','(11) 98123-4567','(11) 98123-4567',null,'São Paulo','SP','Vila Mariana','Rua Domingos de Morais','2100','04010-100',-23.5895,-46.6345,'Residencial',90,'{"Residencial"}'),
  ('00000000-0000-0000-0000-000000000503','00000000-0000-0000-0000-000000000001','pj','Restaurante Sabor & Cia','Sabor e Cia Alimentos','22.333.444/0001-55','(11) 3222-3333','(11) 99222-3333','gerencia@saborcia.com','São Paulo','SP','Moema','Av. Ibirapuera','1500','04029-000',-23.6009,-46.6555,'Comercial',340,'{"Contrato trimestral","Alimentício"}');

-- Agendamentos (hoje)
insert into appointments (id, org_id, customer_id, service_type_id, technician_id, status, priority, scheduled_start, scheduled_end, estimated_minutes, address, route_order) values
  ('00000000-0000-0000-0000-000000000601','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000501','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000b1','finalizado','normal', date_trunc('day', now()) + interval '8 hour', date_trunc('day', now()) + interval '9 hour 30 min',90,'Rua dos Pinheiros, 820 — Pinheiros',1),
  ('00000000-0000-0000-0000-000000000602','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000503','00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000b1','em_atendimento','alta', date_trunc('day', now()) + interval '10 hour', date_trunc('day', now()) + interval '11 hour 15 min',75,'Av. Ibirapuera, 1500 — Moema',2),
  ('00000000-0000-0000-0000-000000000603','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000502','00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-0000000000b2','confirmado','normal', date_trunc('day', now()) + interval '11 hour', date_trunc('day', now()) + interval '12 hour',60,'Rua Domingos de Morais, 2100 — Vila Mariana',1);

-- Ordem de serviço (da visita finalizada)
insert into service_orders (id, org_id, number, appointment_id, customer_id, technician_id, service_type_id, status, area_treated, procedures, started_at, finished_at, total_minutes, customer_signature_url) values
  ('00000000-0000-0000-0000-000000000701','00000000-0000-0000-0000-000000000001',1044,'00000000-0000-0000-0000-000000000601','00000000-0000-0000-0000-000000000501','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000d1','concluida','Cozinha e estoque','Pulverização e gel', date_trunc('day', now()) + interval '8 hour', date_trunc('day', now()) + interval '9 hour 24 min',84,'assinado');

insert into service_order_products (service_order_id, product_id, used_qty, unit) values
  ('00000000-0000-0000-0000-000000000701','00000000-0000-0000-0000-000000000201',0.8,'L');
insert into service_order_pests (service_order_id, pest_id) values
  ('00000000-0000-0000-0000-000000000701','00000000-0000-0000-0000-0000000000e1');

-- Financeiro
insert into finance_entries (org_id, type, status, description, amount, customer_id, service_order_id, due_date, paid_at) values
  ('00000000-0000-0000-0000-000000000001','receita','pago','OS #1044 · Padaria Pão Quente',320,'00000000-0000-0000-0000-000000000501','00000000-0000-0000-0000-000000000701', current_date, current_date),
  ('00000000-0000-0000-0000-000000000001','receita','pendente','Contrato mensal · Restaurante Sabor & Cia',980,'00000000-0000-0000-0000-000000000503',null, current_date + 5, null),
  ('00000000-0000-0000-0000-000000000001','despesa','pago','Compra de insumos · BioControl',1240,null,null, current_date - 6, current_date - 6);

-- Licenças
insert into licenses (org_id, name, issuer, number, responsible_id, issued_at, expires_at, status) values
  ('00000000-0000-0000-0000-000000000001','Alvará Sanitário','Vigilância Sanitária Municipal','VS-2024-3391','00000000-0000-0000-0000-0000000000a2', current_date - 300, current_date + 65,'ativa'),
  ('00000000-0000-0000-0000-000000000001','Registro Responsável Técnico (CRQ)','CRQ-IV','RT-04-55210','00000000-0000-0000-0000-0000000000a2', current_date - 600, current_date - 8,'vencida');

-- CRM
insert into crm_leads (org_id, name, company, phone, source, stage, estimated_value, owner_id) values
  ('00000000-0000-0000-0000-000000000001','Hotel Vista Mar','Vista Mar Hotéis','(11) 3777-8888','Site','novo_contato',2400,'00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-000000000001','Clínica São Lucas','São Lucas Saúde','(11) 3888-9999','Indicação','orcamento',1800,'00000000-0000-0000-0000-0000000000a2');

-- ============================================================================
-- Fim do seed.
-- ============================================================================
