# Dependências e `npm audit`

## Não rode `npm audit fix --force`

Ele resolveria os avisos restantes subindo **react-router 6 → 7** e
**vite 5 → 8** (três versões maiores de uma vez). Isso mexe em todas as rotas
e em todo o build, para corrigir problemas que **não são alcançáveis neste
app** — explicado abaixo. O `--force` troca um risco real (quebrar o sistema
em produção) por um ganho de segurança que aqui é zero.

`npm audit fix` sem `--force` é seguro e já foi aplicado: corrigiu as quatro
falhas de severidade alta mexendo só no `package-lock.json`, sem trocar
nenhuma versão declarada no `package.json`.

## Por que os avisos restantes não se aplicam

### esbuild / vite — servidor de desenvolvimento

> *esbuild enables any website to send any requests to the development server
> and read the response* (GHSA-67mh-4wv8-2f99)

Vale só enquanto `npm run dev` está rodando, na máquina de quem desenvolve.
O que vai para produção é o resultado estático do `npm run build` — esbuild
não é servido junto e não existe em produção.

**Mitigação, se incomodar:** não deixe o dev server exposto na rede (o Vite
já escuta só em localhost por padrão; evite `--host` em rede pública).

### react-router — redirecionamento aberto e hidratação SSR

> *Open redirect via backslash in `<Link>` and `useNavigate`* (GHSA-wrjc-x8rr-h8h6)

Depende de o destino da navegação vir do usuário. Neste app, **nenhum destino
vem de entrada do usuário ou da URL** — todos são caminhos fixos do código:

- `LoginPage` e `DefinirSenhaPage` navegam para `landingPathFor(user)`, que só
  devolve `/`, `/campo` ou `/portal`;
- `Sidebar`, `FieldLayout` e `PortalLayout` usam listas de rotas declaradas no
  código;
- `CommandPalette` navega para itens de `navItems` ou `/clientes?id=<id>`;
- `RequireAuth` guarda `state={{ from: location.pathname }}`, mas **esse valor
  nunca é usado como destino** — o login sempre manda para a rota do papel.

> *Arbitrary Constructor Injection via deserializeErrors() in SSR Hydration*
> (GHSA-337j-9hxr-rhxg)

O app é uma SPA com `createBrowserRouter`, sem renderização no servidor. O
código vulnerável não é executado.

## Se um dia isso mudar

Passe a valer a pena atualizar quando:

- algum destino de navegação passar a vir da URL ou de um campo do usuário
  (por exemplo, "voltar para a página que eu tentei abrir" depois do login) —
  aí o redirecionamento aberto vira risco de verdade; ou
- o app ganhar renderização no servidor.

Nesse caso, a atualização do react-router precisa de verificação no navegador
cobrindo **todas as rotas** — escritório, `/campo` e `/portal` —, porque uma
versão maior de roteador mexe em cada tela.

## Conferir a situação

```bash
npm audit                 # lista o que existe hoje
npm audit fix             # aplica só o que não quebra
```
