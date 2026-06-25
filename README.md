# Amauta — Chat Financiero

App web (Next.js) del clon de Alphacast de Amauta Inversiones Financieras.
Permite pedir series históricas de mercado y macro en lenguaje natural y verlas
en gráficos interactivos.

## Fuentes de datos
- **Reuters Eikon** (mercados global + ARG, vía worker local)
- **BCRA** (macro/monetario Argentina)
- **BLS** (empleo / CPI EE.UU.)
- **FRED** (macro EE.UU./global, tasas)
- **BEA** (cuentas nacionales EE.UU.)

## Stack
Next.js 14 (App Router) · SDK de Anthropic (tool use) · Supabase · Recharts · Vercel.

## Deploy
Conectado a Vercel: cada push a `main` publica automáticamente.

## Variables de entorno (en Vercel)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`,
`ANTHROPIC_API_KEY`, `BLS_API_KEY`, `FRED_API_KEY`, `BEA_API_KEY`.
