# source-queries

How to query each authoritative source for a member's works. Follow these patterns literally — small differences in URL parameters change what's returned.

All APIs below are public and don't require authentication, but please include a contact header on repeated requests (the skill uses `User-Agent: labnet-publications (mailto:muanlartins@gmail.com)`).

## OpenAlex (primary)

OpenAlex is the best default: an open, well-structured, regularly-refreshed bibliographic graph with strong CS coverage.

### Author discovery

Given an ORCID:
```
GET https://api.openalex.org/authors/orcid:<ORCID>
```
Returns the canonical author record with `id` (e.g., `https://openalex.org/A5012345678`). Store the `A...` suffix as `openalex_id`.

Given only a name + affiliation (UFRJ ROR: `03490as77`, OpenAlex id `I122140584`):
```
GET https://api.openalex.org/authors?search=<full name, URL-encoded>&filter=affiliations.institution.ror:03490as77&per_page=10
```

OpenAlex splits the same real person across multiple author records frequently. When a name comes back with multiple hits (all with UFRJ affiliation), treat them as aliases of one person — record every `openalex_id` you find (the schema's `openalex_id` field can hold a comma-separated list or the most active one; store the rest in member `notes`). Pool works from all of them and dedup via `dedup-rules.md`.
Inspect each result's `display_name_alternatives` and `affiliations` to pick the right one. If ambiguous, record the top candidate in `notes` and flag for human review — **don't guess**.

### Works for a given author, incremental

```
GET https://api.openalex.org/works
  ?filter=authorships.author.id:A<openalex_id>,from_publication_date:<last_research_date>
  &sort=publication_date:desc
  &per_page=200
  &cursor=*
```

Follow `meta.next_cursor` for pagination. Each work object gives:
- `id` (openalex url), `doi`, `title`, `publication_year`, `publication_date`
- `type` (e.g., `journal-article`, `proceedings-article`, `book-chapter`, `preprint`, `report`, `dissertation`)
- `authorships[]` with each author's `display_name`, `orcid`, `institutions[]`
- `host_venue` / `primary_location.source` with `display_name`, `type`, `publisher`, `issn_l`
- `locations[]` — often contains the open-access PDF URL
- `abstract_inverted_index` — reverse-index the abstract (iterate keys, for each key the value array lists token positions)
- `language`, `keywords`, `concepts`

Map OpenAlex's `type` → our `publication_types`:
| OpenAlex | Ours |
|---|---|
| `journal-article` | `journal_article` |
| `proceedings-article` | `conference_paper` (or `workshop_paper` if venue name contains "Workshop") |
| `book-chapter` | `book_chapter` |
| `book` | `book` |
| `dissertation` | `thesis` or `dissertation` (inspect title) |
| `report` | `technical_report` |
| `preprint` | `preprint` |
| `editorial` | `editorial` |
| `letter` | `editorial` |
| `review` | `review` |
| `dataset` | `dataset` |
| `other` | best-effort from venue/context; otherwise `technical_report` |

## DBLP

Best for CS venue canonicalization. Has clean XML exports per author.

### Author discovery

```
GET https://dblp.org/search?q=<name>&format=json
```
Returns hits; pick the one whose `info.affiliations` mentions UFRJ / COPPE / NCE.

Once picked, store the pid path segment (e.g., `dblp.org/pid/123/4567` → `dblp_pid: "123/4567"`).

### Works for an author

```
GET https://dblp.org/pid/<pid>.xml
```

Parse the XML. Each `<article>`, `<inproceedings>`, `<proceedings>`, `<book>`, `<incollection>`, `<phdthesis>`, `<mastersthesis>`, `<editor>` is one record.

Map DBLP tags → our types:
| DBLP tag | Ours |
|---|---|
| `article` | `journal_article` |
| `inproceedings` | `conference_paper` (workshop-named venues → `workshop_paper`) |
| `proceedings` | service record with `role: editor_of_proceedings` (if not already in our taxonomy, or track as edited_book) |
| `book` | `book` |
| `incollection` | `book_chapter` |
| `phdthesis` | `thesis` |
| `mastersthesis` | `dissertation` |

DBLP gives you `<key>`, `<title>`, `<author>`, `<year>`, `<booktitle>`/`<journal>`, `<volume>`, `<number>`, `<pages>`, `<ee>` (external link, often DOI). Store `key` as `identifiers.dblp_key`.

DBLP doesn't have abstracts — pull those from OpenAlex or Crossref.

## SBC SOL (Sociedade Brasileira de Computação)

https://sol.sbc.org.br — the open library for SBC-sponsored events. Indispensable for Brazilian CS publications.

### Author search

SOL uses OJS; the search URL:
```
https://sol.sbc.org.br/index.php/indice/search?query=<name>&authors=<name>&dateFromYear=<from>&dateToYear=<to>
```

Parse the result list. Each hit links to an article page at:
```
https://sol.sbc.org.br/index.php/<event_slug>/article/view/<num>
```

The article page exposes:
- Title (often PT), English title (if bilingual)
- Authors with affiliations
- Event name + year (from the breadcrumb / issue info)
- Abstract
- PDF link (same path + `/file` or `/pdf`)

Store `identifiers.sbc_sol_id` as `<event_slug>/<num>`.

SOL often lacks DOIs for older proceedings — don't expect them.

### Venue mapping

Common SBC venues with short names we use:
- CSBC — Congresso da Sociedade Brasileira de Computação
- SBRC — Simpósio Brasileiro de Redes de Computadores e Sistemas Distribuídos
- SBSeg — Simpósio Brasileiro em Segurança da Informação e de Sistemas Computacionais
- SBES — Simpósio Brasileiro de Engenharia de Software
- BRACIS — Brazilian Conference on Intelligent Systems
- ERAD-RJ, WoSiDA, WPerformance, Courb, WGRS, etc. — workshops; use `workshop_paper` type.

When writing a venue block for an SBC paper, set `venue.society: sbc`.

## ORCID

Use as a cross-check / fallback. Works endpoint:
```
GET https://pub.orcid.org/v3.0/<ORCID>/works
Accept: application/json
```

Returns a `group` list; each has `work-summary[0]` with `put-code`, `title`, `type`, `publication-date`, `external-ids`.

For full metadata on one item:
```
GET https://pub.orcid.org/v3.0/<ORCID>/work/<put-code>
```

ORCID `type` values map loosely:
- `journal-article` → `journal_article`
- `conference-paper` → `conference_paper`
- `book` → `book`
- `book-chapter` → `book_chapter`
- `dissertation-thesis` → `thesis` / `dissertation` (check title)
- `other` → best-effort

ORCID often includes `works` the author self-reported but aren't in OpenAlex/DBLP (Portuguese-only venues, invited talks framed as "works"). Useful for catching gaps.

## Google Scholar (last resort)

No API. WebFetch:
```
https://scholar.google.com/citations?user=<scholar_id>&hl=en&sortby=pubdate&cstart=<offset>&pagesize=100
```

Scholar profiles pre-disambiguated by the user are reliable; profiles flagged as "this profile is not verified" are not. Cross-check everything Scholar says with another source before adding it.

Scholar gives you title, co-authors (truncated), venue, year, citation count, and a "cites" link. That's it. No DOI, no abstract, no venue type.

Rate limits are aggressive — keep Scholar calls under 5 per refresh run.

## Crossref (for DOI enrichment)

When you have a DOI but missing metadata (abstract, volume, issue, publisher):
```
GET https://api.crossref.org/works/<DOI>
```

## Semantic Scholar (optional)

OpenAlex covers most of what Semantic Scholar does; reach for SS only when OpenAlex is thin on a specific paper (e.g., AI/ML preprints).

```
GET https://api.semanticscholar.org/graph/v1/paper/DOI:<doi>?fields=title,authors,year,venue,abstract,externalIds
```

## Lattes

Two very different paths. Prefer the PDF.

### Lattes PDF (preferred, high-trust)

The Lattes website has an "Exportar → PDF" button. When the user drops that PDF anywhere under `~/repos/`, it becomes the single best source for Brazilian-venue coverage — no JavaScript, no CAPTCHA, no rate limits.

**Detection.** At the start of each member's refresh, before querying APIs:

```bash
find $HOME/repos -maxdepth 4 -type f \( \
    -iname "*Lattes*<surname>*.pdf" -o \
    -iname "*<full_name>*.pdf" -o \
    -iname "*Currículo*<given_name>*.pdf" \
\)
```

Read the file with the Read tool — PDF extraction is built in. Focus on these sections:

| Section | Maps to |
|---|---|
| `Identificação` → ORCID iD, Lattes iD, Nome em citações | Member `profiles.orcid`, `profiles.lattes_id`, `aliases` |
| `Formação acadêmica/titulação` | PhD / master / TCC records (type `thesis` / `dissertation` / `tcc`) + derived advising services for LabNet advisors/co-advisors |
| `Produção bibliográfica` → `Trabalhos completos publicados em anais de congressos` | `type: conference_paper` / `symposium_paper` / `workshop_paper` |
| `Produção bibliográfica` → `Artigos completos publicados em periódicos` | `type: journal_article` |
| `Produção bibliográfica` → `Artigos aceitos para publicação` | Still a valid published record — include as `journal_article` or `conference_paper` per the venue. Some members (like Marcos Araújo with Heimdall) mis-label the venue here; cross-check DBLP. |
| `Capítulos de livros publicados` | `type: book_chapter` |
| `Bancas` → `Participação em bancas de trabalhos de conclusão` | Service: `tcc_jury` / `dissertation_jury` / `thesis_jury` / `qualifying_exam` |
| `Orientações concluídas` | Services: `advising_phd` / `advising_masters` / `advising_tcc` / `advising_ic` / `advising_specialization` |
| `Orientações em andamento` | Same services, `year_end: null` |
| `Revisor de periódico` | `reviewer_journal` |
| `Revisor de projeto` | `grant_reviewer` |
| `Organização de eventos` | `event_organizer` / `general_chair` / `track_chair` per the role listed |
| `Projetos de pesquisa` | Context for bio / `notes` — not publications |

**Trust.** A Lattes-only record is a valid record: add it, cite `source: lattes` with `url: http://lattes.cnpq.br/<lattes_id>` and `fetched_at: <today>`. Do not downgrade a Brazilian-venue paper just because OpenAlex missed it — OpenAlex systematically under-indexes SBSE / Grounding-and-Lightning / CIMElec / SIC / regional workshops, and the Lattes is your only view of that tail.

**Mark the check.** After writing all records, set `lattes_checked_at: <today>` on the member YAML. Future runs check this field to know whether the Lattes corpus has been mined.

### Lattes HTML (default: skip)

`http://lattes.cnpq.br/<lattes_id>` returns a JS-rendered HTML CV that's CAPTCHA-gated on repeated fetches. WebFetch returns mostly layout. The authoritative XML export requires the owner's login — we can't automate that.

Touch the live HTML only when:
- No PDF is available in `~/repos/`.
- The user explicitly requests it.
- You need a single specific Lattes-exclusive item linked from another source.

Even then, grab what you can and note the scrape limitations in the record's `notes`.
