# Fiscal — Emissão de NFS-e

Arquivos: [`src/application/fiscal/providers.ts`](../src/application/fiscal/providers.ts)
(provedores de emissão), [`src/application/fiscal/tax.ts`](../src/application/fiscal/tax.ts)
(cálculo de ISS/retenções), [`src/store/invoicesStore.ts`](../src/store/invoicesStore.ts)
(histórico de notas), [`src/presentation/pages/FiscalPage.tsx`](../src/presentation/pages/FiscalPage.tsx)
(tela).

## Arquitetura

O app hoje emite **NFS-e** (Nota Fiscal de Serviço Eletrônica) — o documento
fiscal correto para uma prestadora de serviços de dedetização. Não há emissão
de NFe/NFC-e (nota de produto) porque o domínio (`Invoice`) e o cálculo de
tributos (`computeTaxes`) são modelados em torno de serviço + ISS, não de
mercadoria + ICMS. Se a empresa passar a vender produtos separadamente da
prestação do serviço, isso é um módulo novo — avise antes de assumir que os
dois cabem na mesma estrutura.

Existem três provedores de emissão, selecionáveis em **Fiscal → Integração
NFS-e → Provedor**:

| Provedor | Como funciona | Exige |
|---|---|---|
| **Simulação** | Calcula tributos e mostra o que seria enviado; não transmite nada. | Nada — é o padrão. |
| **Governo · NFS-e Nacional** | Monta a DPS no padrão nacional (Receita Federal) e assina/transmite via backend. | Certificado e-CNPJ (A1/A3) + backend próprio. |
| **Focus NFe** | Monta o payload no formato da Focus NFe; a assinatura e a transmissão à prefeitura ficam por conta deles. | Conta na Focus NFe + token + backend próprio. |

**Por que sempre passa por um backend:** tanto o certificado e-CNPJ quanto o
token da Focus NFe dão acesso total à emissão de notas em nome da empresa —
nenhum dos dois pode ficar no navegador (o bundle JS é público). Sem
`backendUrl` configurado, o provedor selecionado opera em **modo simulado**,
seguindo o mesmo fluxo de UI/cálculo, só sem transmitir de verdade.

## Focus NFe — passo a passo

1. Crie uma conta na [Focus NFe](https://focusnfe.com.br) e habilite o CNPJ da
   empresa para NFS-e no município de prestação (nem todo município é
   suportado — confirme antes de contratar).
2. Gere o **token de acesso** no painel da Focus NFe (há um token de
   homologação e um de produção — teste com o de homologação primeiro).
3. Deploy do backend de referência incluído no repositório:
   ```bash
   supabase functions deploy emitir-nfse-focus
   supabase secrets set FOCUS_NFE_TOKEN=xxxxxxxxxxxx
   ```
4. Em **Fiscal → Integração NFS-e**, selecione o provedor **Focus NFe**, cole
   a URL da function (`https://<projeto>.supabase.co/functions/v1/emitir-nfse-focus`)
   em "URL do backend de emissão", escolha o **Ambiente** (comece em
   Homologação) e confirme município (código IBGE) e item da lista de
   serviços (LC 116 — dedetização = 14.02).
5. Emita uma nota de teste a partir de uma Ordem de Serviço concluída e
   confira o resultado no painel da Focus NFe.

O payload exato varia por plugin municipal da Focus NFe — o schema montado em
`buildFocusNfePayload` (`providers.ts`) é um subconjunto representativo.
Confira a [documentação atual da Focus NFe](https://focusnfe.com.br/doc/#nfse-emitir-nota)
e ajuste os campos ao ativar um município novo.

### Item LC 116 × código tributário do município — não são a mesma coisa

`itemListaServico` é a classificação **nacional** (LC 116, formato `X.XX` —
ex.: `7.13` para limpeza/desinfecção/controle de pragas, `14.02` para outros
serviços de manutenção). Municípios que já migraram pro NFS-e Nacional usam
só esse código. Municípios que **ainda têm webservice próprio** costumam ter
uma tabela de códigos interna e diferente (ex.: um "código CES" numérico tipo
`1491`) — não presuma que os dois números são iguais só porque o serviço é o
mesmo. Por isso `codigoTributarioMunicipal` existe como campo **separado e
opcional** em `FiscalConfig`: deixe em branco quando o município usa só o LC
116; preencha só quando a prefeitura/contador confirmar que existe um código
próprio. Hoje é um valor único por organização — se a empresa emitir nota em
mais de um município no futuro, isso precisa virar uma tabela (código por
município), não um campo solto.

### Município de prestação por atendimento (ainda não implementado)

Hoje `municipioIbge` é uma configuração única da organização (assume que toda
nota é emitida no município da sede). Isso é uma simplificação conhecida: o
correto seria a nota sair no município onde o serviço foi **prestado**, que
pode variar por cliente/OS. Como cada cliente já tem `city`/`state`
cadastrados, o caminho mais provável é derivar o código IBGE a partir do
cadastro do cliente (precisa de uma tabela cidade→IBGE) em vez de pedir esse
dado de novo em cada OS. Ainda não entrou em desenvolvimento.

**Emissão assíncrona:** a Focus NFe normalmente responde
`processando_autorizacao` no POST inicial e autoriza a nota depois. O backend
de referência faz algumas tentativas curtas de consulta antes de devolver
`processando` ao app (a nota fica visível com esse status até você recarregar
e ela virar `emitida`/`rejeitada`). **Para produção**, prefira configurar o
**webhook** da Focus NFe para notificar quando a nota for autorizada, em vez
de depender só desse poll limitado — isso ainda não está implementado aqui e
exigiria uma function adicional que atualize `invoicesStore` a partir do
webhook (hoje esse store só existe no `localStorage` do navegador; um webhook
só consegue atualizar dado do lado do servidor, então isso também depende da
migração dos dados fiscais para o Supabase — ver `docs/DATABASE.md`).

## Governo · NFS-e Nacional

Segue o mesmo padrão de configuração, mas exige assinatura ICP-Brasil com
certificado e-CNPJ e TLS mútuo com o webservice do governo — o template em
`supabase/functions/emitir-nfse/index.ts` documenta os passos e deixa
marcados (`throw new Error(...)`) os pontos que precisam de uma lib de
assinatura XML antes de funcionar de verdade. É bem mais trabalho de
implementar que a Focus NFe, que já abstrai isso.
