---
name: refresh-publications
description: Refresh labnet-publications' member + publication + service data by querying OpenAlex, DBLP, SBC SOL, ORCID, and Google Scholar for each member's work since their last_research_date, deduplicating across sources, writing per-record YAML files, and opening a single PR. Triggers when the user runs /refresh-publications, asks to "refresh the publications", or when the in-page banner says a refresh is overdue.
---

# refresh-publications

This skill keeps `labnet-publications` in sync with what LabNet's members are actually publishing. It runs on a ~30-day cadence (configured in `data/meta.yaml`) and is the main mechanism by which publication/service data is added between human contributions.

The design pivot vs. labnet-calendar's `refresh-events`: **refresh is per-member, incremental from each member's `last_research_date`**, not per-event. Every member YAML carries its own "last researched through this date" marker, and the skill only asks sources for work newer than that marker. That keeps repeat runs cheap — once a member's corpus is ingested, future runs are short.

## Inputs (read first)

| File | Purpose |
|---|---|
| `data/meta.yaml` | `last_refresh`, `cadence_days`, `schema_version` |
| `data/tags.yaml` | Controlled vocabularies (areas, publication types, service roles, sources). Refuse to introduce values that aren't in here. |
| `data/members/*.yaml` | One file per member. Key field: `last_research_date` — refresh pulls items with publication date > this. |
| `data/publications/*.yaml` | Existing authored works — used for dedup. |
| `data/services/*.yaml` | Existing service records — used for dedup. |
| `schema/*.schema.json` | The contracts — `npm run validate` enforces these. |

Companion docs in this directory:
- `source-queries.md` — exact API / URL patterns per source.
- `dedup-rules.md` — how to match items found in multiple sources without creating duplicates.
- `examples/` — example publication and service YAMLs across types.

## Protocol

### 1. Triage (no network)

Read every member YAML.

If the user passed member ids as arguments, keep only those.

For each remaining member, decide `should_refresh`:
- Missing / null `last_research_date` → **yes, full pull** (bounded by `research_since` if set).
- `last_research_date + cadence_days ≤ today` → **yes, incremental pull** from `last_research_date`.
- Otherwise → **skip** (unless `--full` flag passed).

Build a queue `to_refresh[]`. Log the skipped members with their next-due date for the PR description.

### 2. Ensure each member has discoverable identifiers

Before querying sources, make sure we have a stable author identifier for each member. The quality of identifiers determines query accuracy.

For each member in `to_refresh[]`, check the `profiles` block:

| Identifier | Required? | How to obtain if missing |
|---|---|---|
| `orcid` | Strongly preferred | WebSearch `<full_name> ORCID PESC COPPE UFRJ`; verify the profile's affiliation includes UFRJ / PESC / COPPE before trusting. |
| `openalex_id` | Derived | Query `https://api.openalex.org/authors?search=<full_name>&filter=affiliations.institution.ror:03490as77` (UFRJ ROR) and pick the best match. If an ORCID is known, `https://api.openalex.org/authors/orcid:<orcid>` is definitive. Note: OpenAlex frequently has **multiple author records per real person** — Claudio Miceli alone has 4 (A5103239461, A5084620248, A5121639446, A5114285275). Collect works from all matching records, dedup via `dedup-rules.md`. |
| `dblp_pid` | Nice to have | WebFetch `https://dblp.org/search?q=<name>`; pick the profile whose affiliation box mentions UFRJ / COPPE. |
| `lattes_id` | Already seeded | — |
| `scholar_id` | Already seeded for most | Rarely needed directly — OpenAlex + DBLP + SOL cover the corpus. |

If you add an identifier, update the member YAML **before** starting the refresh queries — subsequent runs will benefit.

**Never guess an ORCID.** If you can't verify by UFRJ affiliation, leave it null and log the member for human attention.

**Lattes PDF detection.** Before starting source queries for a member, look for a Lattes PDF export in the user's repos:

```
find $HOME/repos -maxdepth 4 -iname "*Lattes*<surname>*.pdf" -o -iname "*<full_name>*.pdf"
```

If found, read it with the Read tool (handles PDFs natively) and treat it as the **highest-trust source** for that member for this run — ORCIDs visible on the Lattes but not surfaced by search APIs are still safe to adopt, and the publications/services lists there are authoritative for Brazilian-venue work that OpenAlex/DBLP/SBC SOL don't index (electrical-engineering conferences, UFRA / PPGI / local theses, domestic journals). See §3 and §6 below for how it feeds into the source order. Whether or not a Lattes PDF was cross-checked is recorded on the member YAML as `lattes_checked_at: <date>` (null / absent means not yet checked — the record is probably missing the long tail).

### 3. Query each source per member

For every member in `to_refresh[]`:

Use `source-queries.md` for exact URL / API patterns. The order below is intentional — items first found via higher-trust sources preempt lower-trust duplicates.

1. **Lattes PDF** (only when a file was found in step 2) — read the `Produções` and `Formação` sections. Authoritative for ORCID, master / TCC theses at non-CS programs, and Brazilian-venue papers that aren't in OpenAlex / DBLP / SOL. A Lattes-only paper is a valid record; don't drop it just because no other source knows about it.
2. **OpenAlex** (best for coverage + metadata quality, supports ORCID filter + date filter).
3. **DBLP** (best for CS conference / journal canonicalization).
4. **SBC SOL** (https://sol.sbc.org.br) — the authoritative index for all SBC-sponsored proceedings; indispensable for Brazilian venues (SBRC, SBSeg, BRACIS, CSBC, etc.). Paper cites often redirect here.
5. **ORCID** (https://pub.orcid.org/v3.0/<orcid>/works) — picks up self-reported works missing elsewhere.
6. **Google Scholar** — only as a last-resort tiebreaker or for works none of the above know about. Scholar has no API; WebFetch on the profile's `sortby=pubdate` URL and parse the listing. Do NOT rely on Scholar alone because disambiguation is weak.
7. **Lattes HTML** — skip by default. Lattes is JS-rendered and CAPTCHA-protected. Touch the live HTML only if (a) no PDF is available and (b) a user explicitly requests it. Prefer asking the user to drop a PDF in `~/repos/`.

Collect all hits with publication date > `last_research_date` (or, on first pull, > `research_since` if set, else unbounded).

### 4. Deduplicate + merge

Follow `dedup-rules.md`. Keep one YAML per work. If a work already exists in `data/publications/`, you're **updating** — append the new source record to `sources[]`, bump `last_verified`, fill in any previously-null fields (DOI, abstract, etc.). Do **not** overwrite existing non-null fields unless the source data is authoritative and conflicts (rare; note the conflict in `notes`).

### 5. Classify each work

Decide:
- `type` — journal_article, conference_paper, workshop_paper, book_chapter, thesis, etc. Use venue cues + OpenAlex's `type_crossref` / DBLP's element tag. Never invent a type not in `tags.yaml`.
- `areas` — assign 1–3 area ids from `tags.yaml` based on venue + title. If unsure, use a broad area (e.g. `networking`, `se`) rather than leaving empty.
- `language` — `pt` for SBC venues with Portuguese titles; `en` otherwise.
- `venue.society` if detectable (SBC / ACM / IEEE / USENIX / Springer / Elsevier / Wiley / MDPI / other).

### 6. Handle service activities

Program-committee memberships, juries/bancas, editorial boards, invited talks, advising — these live in `data/services/<id>.yaml`, not `publications/`. Sources:

- **OpenAlex editorial-role** data is sparse; use mainly for PC membership listed alongside works.
- **DBLP** exposes editor roles (for proceedings).
- **SBC SOL** frequently lists PC members on the front matter of proceedings.
- **ORCID** has a `services` section members often self-report.
- **Conference websites** (via WebFetch on the venue URL) list PC rosters — pick these up when processing a publication from that venue.
- **Thesis juries / bancas** are generally only on Lattes. When a Lattes PDF is available (see §2 detection step), lift every `Bancas` / `Revisor de periódico` / `Organização de eventos` / `Orientações` entry directly. Without a Lattes PDF, accept they'll be incomplete.

For advising relationships (prof advised student X on thesis Y), the authoritative source is often the student's graduation record — and the Lattes PDF is the most practical version of that. On first pass, create service records for advising when you see a thesis authored by a LabNet student AND the advisor is also a LabNet member — derive the relationship and write a service YAML for the advisor (AND a co-advising record if a LabNet co-advisor is listed). Same principle for juries: if multiple LabNet members sat on the same panel, every one gets their own service YAML — the panel membership shows up once per Lattes, but attribution is per-member.

### 7. Write YAMLs

- Publications: `data/publications/<id>.yaml` with id convention `<first-labnet-author-last>-<short-title-slug>-<year>`. Slug ≤ 4 words, kebab-case. Example: `miceli-iot-middleware-2022`.
- Services: `data/services/<id>.yaml` with id convention `<member-id>-<role-short>-<venue-short>-<year>`. Example: `claudio-miceli-pc-bracis-2024`.

One file per record, sorted chronologically by year then title — the diff should be reviewable.

Set `verified_by: claude` on everything you touch. Always include at least one `sources[]` entry with `fetched_at: <today>`.

For each processed member, bump `last_research_date` to today. If a Lattes PDF was cross-checked this run, also set `lattes_checked_at` to today. If the Lattes surfaced pre-`research_since` work the user wants ingested (e.g., a pre-LabNet master's thesis), lower `research_since` accordingly and note it in the PR description.

### 8. Validate, build

```bash
npm run validate
npm run build
```

If validation fails, fix the offending record. Common causes:
- Unknown `area` id (add to `tags.yaml` in the same PR — a deliberate change).
- Duplicate publication `id` — pick a longer slug.
- Member FK mismatch — the member id you referenced doesn't exist.

### 9. Update meta

- `data/meta.yaml.last_refresh` → today (UTC ISO date).

### 10. Open PR

Branch: `refresh/YYYY-MM-DD`. Title: `refresh: YYYY-MM-DD`. Body:

```markdown
## Refresh — YYYY-MM-DD

### Added publications (N)
- `<id>` — <title>, <venue> <year> · via <source>

### Updated publications (N)
- `<id>` — what changed (e.g., "added DOI from Crossref")

### Added services (N)
- `<id>` — <title> · via <source>

### Members processed (N)
- `<member-id>` — last_research_date <prev> → <today> · +N publications · +M services

### Members skipped (N)
- `<member-id>` — next due <date>

### Needs human attention (N)
- `<member-id>` / `<work-ish>` — <why: no ORCID found, source returned nothing, ambiguous match, etc.>
```

## Behavioral rules

- **Never fabricate works.** If a source returns nothing, don't synthesize entries from pattern matching. Leave the member's corpus empty this run and log it.
- **ORCID or bust** — if a member has no ORCID and same-name collisions look likely (the most common case for Brazilian names), add at most `safe_mode` matches (venue affiliation matches UFRJ OR co-author is another LabNet member) and flag the rest for human review.
- **Cite sources.** Every record you write must have ≥1 entry in `sources[]` with `fetched_at`.
- **Respect the controlled vocabulary.** New values in `areas`, `publication_types`, `service_roles`, `societies`, `sources` require an edit to `data/tags.yaml` in the same PR.
- **One PR per refresh run.** Don't split unless the user asks.
- **Never push directly to main.** Always the `refresh/YYYY-MM-DD` branch.
- **Don't delete historical records** without user confirmation — even if a source no longer lists them.
- **Don't skip validation** to "make it work" — fix the underlying data.

## Failure modes

| Symptom | Likely cause | Action |
|---|---|---|
| OpenAlex returns 0 works for a member with a Scholar profile showing many | ORCID mismatch or member's OpenAlex author record is unmerged | Search OpenAlex by name + affiliation, check alternate author IDs, link them into the member's `profiles`. |
| DBLP search returns multiple profiles for the same name | Common Brazilian name | Pick the profile whose institution box mentions UFRJ / COPPE. If none do, fall back to ORCID + OpenAlex and skip DBLP for this member. |
| SBC SOL returns a paper with no DOI / co-authors listed in PT-only | Normal — SOL entries are thin | Store what SOL gives you; enrich from OpenAlex/Crossref if the same paper is there. |
| Scholar scraping returns garbled HTML | Rate limit / JS-rendered page | Back off. Don't WebFetch Scholar more than a few times per run. |
| Two candidate publications have identical normalized titles + same year but different authors | Different papers with the same name (common for "Evaluation of..." style titles) | Treat as distinct works; pick unique ids using venue short name. |
| Lattes XML is the only source with a missing venue | Fine to leave empty-venue | Record `venue: null` and write a note in `notes`. |

## What this skill does NOT do

- It does not modify the UI (`web/index.html`, `web/assets/*`).
- It does not change schemas or controlled vocabulary unless explicitly asked.
- It does not deploy. GitHub Actions handles deploy on push to `main`.
- It does not delete records. Past publications and service records stay.
- It does not touch Lattes HTML scraping by default (unreliable, JS-rendered) — use OpenAlex / DBLP / SBC SOL / ORCID as primary.
