# @open-support/site

Public site for [opensupport.dev](https://opensupport.dev). It is its own package and is not built or served by `@open-support/server`.

```bash
pnpm dev:site
```

Vite serves it at `http://localhost:5175`. `pnpm --filter @open-support/site build` writes a static site to `packages/site/dist`.
