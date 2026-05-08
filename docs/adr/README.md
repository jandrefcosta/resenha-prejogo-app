# Architecture Decision Records (ADRs)

Each file here records ONE important architectural decision and why.

## When to create an ADR
- You picked a technology/approach over another.
- The decision is hard or expensive to reverse later.
- Other devs (or you in the future) will ask "why was it done this way?".

## Format
Numbered sequentially: `0001-short-title.md`, `0002-...`, etc.

Use the template at `<dev-standards>/templates/ADR.md.tpl`.

ADRs are immutable: if a decision changes, create a new ADR that
SUPERSEDES the old one (reference its number), and mark the old one as
"superseded by 00XX".
