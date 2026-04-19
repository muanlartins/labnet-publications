---
description: Refresh LabNet members' publication + service records from authoritative sources (OpenAlex, DBLP, SBC SOL, ORCID) and open a PR
---

Load the `refresh-publications` skill from `.claude/skills/refresh-publications/SKILL.md` and execute the full refresh protocol against this repository.

Inputs to consider:
- `data/meta.yaml` — current refresh state and cadence
- `data/members/*.yaml` — every LabNet member (each has a `last_research_date`)
- `data/publications/*.yaml` — existing authored works
- `data/services/*.yaml` — existing service records

Output: a single pull request titled `refresh: YYYY-MM-DD` that contains new/updated publication + service YAMLs, bumped `last_research_date` on every processed member, bumped `last_refresh` in `data/meta.yaml`, and a regenerated `web/data/site.json`. Validation (`npm run validate`) must pass before the PR is opened.

If the user passes arguments:
- Member ids (e.g. `/refresh-publications claudio-miceli pedro-boechat`) — restrict the run to those members.
- `--since YYYY-MM-DD` — override the per-member `last_research_date` floor for this run only.
- `--full` — ignore `last_research_date` and do a full rebuild for the named members (use sparingly; costly).
