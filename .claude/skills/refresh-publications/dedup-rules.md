# dedup-rules

A single paper typically appears across OpenAlex, DBLP, SBC SOL, ORCID, and Scholar with slightly different metadata. The goal: one YAML per real-world work.

## Matching

Compute a normalized fingerprint per incoming work:

1. **Title**: lowercase; strip Unicode diacritics (`á→a`, `ã→a`, `ç→c`); collapse whitespace; drop trailing punctuation.
2. **First author surname**: same normalization on the last name of the first-listed author.
3. **Year**.

Two works match if **all three match exactly**, OR DOI matches (DOI is authoritative — a DOI match always wins over any other signal).

Where titles differ but DOIs match: trust the DOI.

Where DOIs are absent and titles are "close but not identical" (Levenshtein distance > 0 but ≤ 3 characters on a normalized ≥ 30-char title), merge — but record both titles (one as `title`, the other as `title_en` or `title_pt` depending on language).

## Merging priority

When the same work comes from multiple sources, fields are filled from the highest-trust source that has a non-null value:

| Field | Priority order |
|---|---|
| `title` | original source's title (prefer the longest non-abbreviated version) |
| `authors[].name` | OpenAlex > DBLP > ORCID > SOL > Scholar |
| `authors[].orcid` | OpenAlex > ORCID > others |
| `year`, `date` | OpenAlex > DBLP > Crossref > SOL > Scholar |
| `type` | OpenAlex (mapped) > DBLP (mapped) > ORCID > SOL (inferred from venue) |
| `venue.*` | DBLP (for CS) > OpenAlex > SOL > ORCID |
| `identifiers.doi` | Crossref > OpenAlex > DBLP `ee` field |
| `pages`, `volume`, `issue` | Crossref > OpenAlex > DBLP |
| `abstract` | OpenAlex (inverted-index, reconstructed) > Crossref > Semantic Scholar |
| `pdf_url` | OpenAlex `open_access.oa_url` > SOL PDF link > DBLP `ee` |
| `identifiers.*` (doi, isbn, issn, arxiv, etc.) | union from all sources |
| `sources[]` | union — one entry per source that returned this work |

## When NOT to merge

- Different DOIs → different works, always.
- Same title, different years → different works (an extended journal version of a conference paper is a distinct publication; note the relationship in `notes`).
- Same title, same year, different author lists → different works (the title collision is coincidental).
- "Proceedings of X 2024" vs "Article 42 in Proceedings of X 2024" — the former is an `edited_book` service record, the latter is a `conference_paper`. Don't merge.

## Cross-member attribution

One publication often has multiple LabNet authors (e.g., Claudio Miceli + Pedro Boechat). Represent this properly:

- `authors[]` includes every author with their `position`. For LabNet authors, set `member_id` to the LabNet id. `is_corresponding` where known.
- `authors_labnet[]` is a denormalized list of member_ids; the build script generates this automatically if unset, but you can set it explicitly if a rare case calls for it.

A publication file is written once, not once per LabNet author. When processing Pedro Boechat's refresh and finding a paper he co-authored with Claudio Miceli:
- If `data/publications/<id>.yaml` already exists (from Claudio's prior refresh), **update it** — bump `last_verified`, add `pedro-boechat` to `authors[].member_id`, extend `sources[]` if a new source surfaced it.
- If not, create it with both LabNet members tagged.

## Updating an existing record

When a refresh run re-encounters a publication already in the repo:

1. Diff the incoming data against the YAML.
2. For each field you might fill: if the YAML has a value, keep it (first-in wins for titles, author lists, etc.). If the YAML has `null`/missing, use the incoming value.
3. Append a new entry to `sources[]` with the new source id + `fetched_at: today` (unless an identical source entry already exists for the same day).
4. Bump `last_verified: today` and set `verified_by: claude`.
5. If incoming data **conflicts** with existing non-null data (e.g., different DOI, different publisher), do NOT silently overwrite. Add a line to `notes` describing the conflict, and flag in PR description under "Needs human attention".

## IDs — stable across re-runs

Once a publication gets an `id`, never rename it. If subsequent refreshes find it with a different slug, they match by DOI / fingerprint and keep the original file / id.

The id convention:
```
<first-labnet-author-surname>-<short-title-slug>-<year>
```
Where:
- Surname = the LabNet author (not necessarily first author of the paper) whose surname is alphabetically first among LabNet co-authors on this paper. That keeps ids deterministic.
- Slug = ≤ 4 words, lowercase, kebab-case, dropping stopwords (a, an, the, of, on, for, in, with, and).
- Year = publication year.

Examples:
- `miceli-energy-iot-middleware-2022`
- `boechat-software-testing-llm-2025`
- `caldas-martins-lorena-trace-analysis-2024` (for a 3-LabNet-author paper, alphabetical first)

If two works collide, append `-v2`, `-v3`, etc.

## Service dedup

Services are easier: keyed by `(member_id, role, venue.short_name, year)`. A second refresh run picking up the same PC membership should not create a duplicate — look for an existing service record and just bump `last_verified`.
