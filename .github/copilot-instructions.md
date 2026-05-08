# GitHub Copilot Instructions — <PROJECT_NAME>

<!--
HOW THIS FILE IS USED BY COPILOT:

1. This file (.github/copilot-instructions.md) is read AUTOMATICALLY by
   Copilot Chat and Copilot inline across the ENTIRE repo. Keep it
   relatively short — general project instructions only.

2. For rules specific to a FILE TYPE, use:
   .github/instructions/<name>.instructions.md
   with YAML frontmatter containing `applyTo:` and a glob.

   Example:
   ---
   applyTo: "**/*.spec.ts,**/*.test.ts"
   ---
   Always use describe/it (not test()). Mocks live in __mocks__/...

3. For reusable PROMPTS (manually invoked), use:
   .github/prompts/<name>.prompt.md
   Accessed via Copilot Chat with /<name>.

4. DO NOT use .github/copilot-instructions.md for things that change every
   feature — it's loaded on EVERY interaction. Keep it stable.
-->

## About the project

<One or two sentences. Mirror the opening of ARCHITECTURE.md.>

## Stack

- <Language + main framework + versions>
- <Build / runtime>
- <Persistence, if any>

## General conventions

- Strict TypeScript; no implicit `any`.
- Relative imports only within the same module. Cross-module uses an
  alias (`@/modules/...`, `@/shared/...`).
- Small functions, with explicit return types on public APIs.
- All code (variable, function, class names), comments, and commits in
  **English**.

## Architecture

The full architecture is in `ARCHITECTURE.md` at the repo root. **Before
proposing structural changes, read that file.** Key points:

- `src/modules/<X>` does not import from `src/modules/<Y>`.
- `src/shared/` and `src/ui/` do not depend on `modules/` or `app/`.
- Big decisions live in `docs/adr/`.

## Testing

- Frameworks: <Jest / Vitest / Playwright>.
- Location: `*.spec.ts` next to the file under test.
- Always test error paths, not just the happy path.

## What to avoid

- Don't introduce new libraries without an ADR justifying it.
- Don't use `console.log` in production code; use `lib/logger.ts`.
- Don't create a `utils/` folder without categorization — prefer a named
  module.
