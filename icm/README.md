# ICM Runner (TypeScript + Bun)

Reescritura en TypeScript del runner de capturas ICM/Renault.
Antes: scripts `.mjs` ejecutados con Node + Puppeteer.
Ahora: TypeScript estricto con Clean Architecture + SOLID, ejecutado con Bun.

## Stack

- **Bun** 1.x como runtime y test runner
- **TypeScript** 5.x (strict, `noUncheckedIndexedAccess`)
- **Puppeteer** 24.x para la automatización del navegador
- **fetch** nativo de Bun para HTTP

## Arquitectura

```plaintext
src/
├── core/         cross-cutting (logger, errors, utils, config, selectors)
├── domain/       modelos puros + interfaces (puertos)
├── application/  use cases + orchestrator
├── infrastructure/ implementaciones concretas (Puppeteer, fetch, AutoIt, ...)
├── ui/           composition root (bootstrap.ts) + entry points
└── tests/        bun test
```

**SOLID**:

- **SRP**: cada use case / implementación tiene una sola razón para cambiar.
- **OCP**: añadir secciones o transport HTTP = nuevas implementaciones, no cambios a use cases.
- **LSP**: cualquier `IHttpClient` / `IBrowserSession` cumple el contrato.
- **ISP**: cada `ISectionCapture` solo conoce sus selectores. `IApiService`, `IAuditLogger`, `IHttpClient` están segregados.
- **DIP**: los use cases reciben interfaces por constructor; solo `bootstrap.ts` cablea implementaciones.

## Comandos

```bash
bun install              # instalar dependencias
bun test                 # correr 12 tests (4 archivos)
bun run typecheck        # tsc --noEmit
bun run start            # loop principal contra CRM (Windows)
bun run start:test       # una sola corrida con VIN fijo (modo dry-run)
bun run build            # bundle para distribución → dist/main.js
```

## Configuración

Variables de entorno (con fallback al valor por defecto):

|       Variable        |           Descripción            |
|-----------------------|----------------------------------|
| `ICM_API_TOKEN`       | Bearer token del backend CRM     |
| `ICM_AUTOIT_EXE`      | Ruta al ejecutable `AutoIt3.exe` |
| `ICM_AUTOIT_ENTERS`   | Ruta a `enters.au3`              |
| `ICM_AUTOIT_PASSWORD` | Ruta a `enter_password.au3`      |
| `ICM_TEST_VIN`        | VIN para `bun run start:test`    |

Las rutas y URLs también están centralizadas en [src/core/config/app-config.ts](src/core/config/app-config.ts).
Los selectores CSS del sitio ICM, en [src/core/config/selectors.ts](src/core/config/selectors.ts).

## Entry points

- [src/ui/main.ts](src/ui/main.ts) — loop infinito (loop de producción).
- [src/ui/main_test.ts](src/ui/main_test.ts) — una sola corrida con VIN fijo, `dryRun: true`.
- [src/ui/bootstrap.ts](src/ui/bootstrap.ts) — composition root. Modifica aquí para swap de implementaciones.

## Migración desde la versión Node

- ✅ Reemplazado: `my_fetch.mjs` → `infrastructure/http/fetch-http-client.ts`.
- ✅ Reemplazado: `queries.mjs` → `infrastructure/api/renault-api.service.ts` + `infrastructure/audit/in-memory-audit-logger.ts`.
- ✅ Reemplazado: `puppeteer_core.mjs` → `infrastructure/browser/puppeteer-browser-session.ts`.
- ✅ Reemplazado: `auth_phase1.mjs` → `application/usecases/phase1-auth.usecase.ts`.
- ✅ Reemplazado: `icm.mjs` → `application/usecases/icm-login.usecase.ts` + `application/usecases/process-vehicle.usecase.ts` + 7 `sections/*`.
- ✅ Reemplazado: `helppers.mjs` → `infrastructure/browser/{frame-navigator,dom-extractor}.ts` + `infrastructure/autoit/windows-autoit-runner.ts`.
- ✅ Reemplazado: `index.js` → `src/ui/main.ts`.
- ✅ Reemplazado: `index_test.js` → `src/ui/main_test.ts`.
- 🗑️ Eliminados: `from_mypc/index.js`, `test.js`.
- 📦 Mantenidos sin cambios: `enters.au3`, `enter_password.au3`, `detener.bat`, `imagenes/`.
- 🔄 Actualizado: `iniciar.bat` invoca `bun src\ui\main.ts` en vez de `node index.js`.

## Pruebas

```bash
bun test
```

Cubre:

- `in-memory-audit-logger.test.ts` — buffer, flush, validación.
- `renault-api.service.test.ts` — comandos HTTP, manejo de errores.
- `fetch-http-client.test.ts` — POST JSON, status != 2xx.
- `phase1-auth.usecase.test.ts` — confirmAccess / selectIcmMod.

Los tests mockean todas las interfaces (`IHttpClient`, `IBrowserSession`, etc.) → rápidos y aislados.
