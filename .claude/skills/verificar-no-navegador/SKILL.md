---
name: verificar-no-navegador
description: Verifica mudanças de UI do Na Mira rodando o app real no navegador (Puppeteer + Chromium headless) antes de commitar. Use ao alterar páginas, componentes, rotas, login/RBAC, agenda, roteirização/mapa ou o app do técnico — sempre que precisar confirmar que a tela funciona de verdade (não só que compila). Cobre login, navegação e captura de erros de runtime + screenshot.
---

# Verificar no navegador (Na Mira)

Fluxo padrão para validar UI antes de commitar. Não deixe rastros no working tree.

## 1. Subir o preview e instalar o driver

```bash
npm run build
npm i -D puppeteer-core          # temporário; removido no fim
npx vite preview --port 4321 &   # rode em background; confirme com curl
sleep 3 && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/
```

Chromium já está instalado: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.

## 2. Script de verificação (`_v.mjs`, temporário)

Pontos essenciais:

- `executablePath` = o Chromium acima; `args: ['--no-sandbox']`.
- **Bloqueie as fontes do Google** (offline): abortar requests cujo URL contém
  `fonts.googleapis`/`fonts.gstatic`. Elas geram `ERR_FAILED` no console —
  ignore esses; qualquer outro erro conta.
- Capture `pageerror` e `console` type `error` (exceto `ERR_FAILED`).
- Login: na `/login`, clique no botão de acesso rápido do perfil desejado
  (texto contém "Administrador"/"Marina" para staff, "Técnico"/"Diego" para o
  técnico). Senha demo: `namira123`.
- Para trocar de usuário entre logins no mesmo processo: limpe as chaves de
  sessão do `localStorage` (`namira-user`) e recarregue `/login`.
- `page.goto(..., { waitUntil: 'networkidle2' })` + pequeno `setTimeout`.

Assertions úteis: contar `svg[aria-label^="Mapa da rota"] circle` (marcadores do
mapa), `.lucide-lock` (hora marcada), ler o texto de badges/`[role=status]`
(toasts). Salve screenshot com `page.screenshot({ path })` no scratchpad.

Atenção: CSS `text-transform: uppercase` deixa o `innerText` em maiúsculas —
compare em maiúsculas ou use `-i`.

## 3. Rodar

```bash
node _v.mjs
```

Espere `ERRORS (0)`. Rotas protegidas: técnico é redirecionado de qualquer rota
de staff para `/campo` (RBAC).

## 4. Limpeza obrigatória antes do commit

```bash
pkill -f "vite preview"
rm -f _v.mjs *.png            # scripts e screenshots de teste
npm remove puppeteer-core
grep -c puppeteer package.json   # deve ser 0
npm run typecheck                # deve passar limpo
```
