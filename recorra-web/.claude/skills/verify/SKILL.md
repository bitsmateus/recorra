---
name: verify
description: Sobe o painel (Next.js) e dirige a interface de verdade para conferir uma mudança visual ou de fluxo. Use quando a alteração tem tela — layout, cores, logo, um formulário, uma listagem.
---

# Verificar o recorra-web rodando

O `next build` **não checa tipos** ("Skipping validation of types"), então build verde
não quer dizer código são. Para tipos, `npx tsc --noEmit`.

> `src/app/(app)/layout.tsx` tem erros **pré-existentes** de tipo nos ícones do lucide
> (`ForwardRefExoticComponent ... is not assignable`). São ruído; filtre pelos arquivos
> que você mexeu.

## Subir

```bash
cd recorra-web
npm run dev > /tmp/next-dev.log 2>&1 &   # porta 3001
sleep 12 && cat /tmp/next-dev.log
```

Derrubar (o `pkill -f "next dev"` não pega no Windows):

```bash
netstat -ano | grep ":3001" | grep LISTENING | head -1 | awk '{print $NF}' | xargs -r -I{} taskkill //F //PID {}
```

## Ver sem o backend

O painel exige login, mas **o backend não precisa estar no ar** para conferir tela: o
`(app)/layout.tsx` só verifica se existe token, não se ele é válido. Injete um falso e
navegue à vontade — as chamadas de API falham e as páginas ficam em "Carregando...",
mas layout, sidebar, títulos e cores renderizam:

```js
await page.evaluate(() => localStorage.setItem('recorra_token', 'fake-para-render'));
await page.goto('http://localhost:3001/clientes');
```

Precisa dos dados de verdade? Aí sim suba o backend (`docker compose up -d` + `npm run
start:dev` em `recorra/`) e entre com `admin@demo.com` / `recorra123`.

## Screenshot

Não há Playwright no projeto. Instale o browser e rode o script fora do repo (use o
scratchpad da sessão, não polua o `recorra-web/`):

```bash
npx --yes playwright@latest install chromium
cd <scratchpad> && npm init -y && npm install playwright
```

Além do screenshot, leia os valores computados — é o que separa "parece certo" de
"está certo":

```js
await page.evaluate(() => getComputedStyle(document.body).backgroundColor);  // → rgb(238, 244, 243)
await el.evaluate((e) => getComputedStyle(e).fontFamily);                     // fonte aplicada mesmo?
await page.request.get('http://localhost:3001/arquivo.svg');                  // 200 ou 404 silencioso?
```

## O que sempre vale conferir

- **Mobile (360px)**: `document.documentElement.scrollWidth === clientWidth`. O projeto
  usa `overflow-x: hidden` no body, então overflow horizontal **não aparece na tela** —
  só nesse número.
- **Drawer mobile**: abra em `button[aria-label="Abrir menu"]`; logo e botão fechar
  dividem a mesma linha e estouram fácil.
- **Sidebar desktop**: `w-60` (240px) com `px-5` → sobram ~200px de largura útil.
- Um círculo escuro com "N" no canto inferior esquerdo é o indicador do Next em dev,
  não um elemento da interface.
