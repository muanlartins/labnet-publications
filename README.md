# labnet-publications

Member directory and publication tracker for [LabNet — PESC/COPPE/UFRJ](https://labnet.nce.ufrj.br/). Lists the lab's members and the body of academic work each has produced — journal articles, conference papers, books, theses, program-committee service, juries, invited talks, advising.

The data is refreshed by [Claude Code](https://claude.com/product/claude-code) on a ~30-day cadence. When the in-page banner says "refresh due", a maintainer opens the repo in Claude Code and runs `/refresh-publications`. Claude queries OpenAlex, DBLP, SBC SOL, and ORCID for each member (only picking up new items since that member's `last_research_date`), writes per-record YAML files, and opens a PR.

**Live site**: https://muanlartins.github.io/labnet-publications (deploys from `main`)

Architecture mirrors [labnet-calendar](https://github.com/muanlartins/labnet-calendar) — per-record YAML, JSON Schema validation, Tailwind+Alpine static site, Claude-driven refresh skill.

## Layout

| Path | Purpose |
|---|---|
| `data/members/<id>.yaml` | One file per lab member (professors, students, alumni) |
| `data/publications/<id>.yaml` | One file per authored work (paper, chapter, thesis) |
| `data/services/<id>.yaml` | One file per service activity (PC, jury, invited talk, advising) |
| `data/tags.yaml` | Controlled vocabulary (areas, publication types, service roles, etc.) |
| `data/meta.yaml` | `last_refresh`, `cadence_days`, `schema_version`, site title strings |
| `schema/*.schema.json` | JSON Schemas enforced by `npm run validate` |
| `scripts/build.mjs` | Compiles YAMLs into `web/data/site.json` |
| `scripts/validate.mjs` | Schema check across every record |
| `web/` | The static site (HTML + Tailwind + Alpine.js, no build framework) |
| `.claude/commands/refresh-publications.md` | Slash-command wrapper |
| `.claude/skills/refresh-publications/` | The refresh protocol Claude follows |

Publications and services reference members by `id`. The build script resolves those FKs and emits a single `web/data/site.json` the page consumes.

## Local development

```bash
npm install
npm run all      # validate + build
npm run dev      # builds, then serves web/ on http://localhost:8000
```

`web/data/` is build output (gitignored) — `npm run all` regenerates it.

## Refreshing the data

```bash
# In Claude Code, with this repo open:
/refresh-publications
```

What happens:
1. Claude reads every `data/members/*.yaml` and checks each member's `last_research_date`.
2. For each member, Claude queries sources (OpenAlex → DBLP → SBC SOL → ORCID → Scholar) for works published/dated since that member's `last_research_date`.
3. New publications / services become new YAML files; existing records get `last_verified` bumped.
4. Each member's `last_research_date` is advanced to today.
5. `data/meta.yaml`'s `last_refresh` is bumped.
6. Validation + build run; a single PR is opened.

Restrict a refresh to specific members:

```bash
/refresh-publications claudio-miceli pedro-boechat
```

Or restrict to a time window:

```bash
/refresh-publications --since 2024-01-01
```

## Adding a member

PR a new file under `data/members/<id>.yaml`. Required fields: `id`, `name`, `role`, `status`, `affiliation`. Leave `last_research_date: null` — the next refresh will populate the member's publications from scratch (bounded by any `research_since` hint you optionally provide).

## Contributing

- **Missing publication** → file an issue using *Report missing publication* with a DOI or direct source link; the next refresh will import it (or add it manually as a PR).
- **Wrong field** → PR a direct edit; keep `last_verified` accurate and run `npm run validate` before pushing.
- **New member** → PR a member YAML. See `.claude/skills/refresh-publications/` for schema guidance.

## License

MIT — see `LICENSE`.

## Credits

Maintained by Luan Martins ([LabNet — PESC/COPPE/UFRJ](https://labnet.nce.ufrj.br/)). Architecture inspired by [labnet-calendar](https://github.com/muanlartins/labnet-calendar). Refreshed by [Claude Code](https://claude.com/product/claude-code).
