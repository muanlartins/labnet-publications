import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import yaml from "js-yaml";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const today = new Date();
const todayISO = today.toISOString().slice(0, 10);

const tags = yaml.load(readFileSync(join(ROOT, "data/tags.yaml"), "utf8"));
const meta = yaml.load(readFileSync(join(ROOT, "data/meta.yaml"), "utf8"));

function loadDir(sub) {
  const dir = join(ROOT, "data", sub);
  const files = readdirSync(dir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  return files.map((f) => yaml.load(readFileSync(join(dir, f), "utf8")));
}

const members = loadDir("members");
const publications = loadDir("publications");
const services = loadDir("services");

const memberById = new Map(members.map((m) => [m.id, m]));

// Derive authors_labnet on publications if not set; enrich for the UI.
for (const pub of publications) {
  if (!pub.authors_labnet) {
    pub.authors_labnet = (pub.authors || [])
      .filter((a) => a.member_id && memberById.has(a.member_id))
      .map((a) => a.member_id);
  }
  pub.authors_labnet = [...new Set(pub.authors_labnet)];
}

// Counts per member.
const byMember = {};
for (const m of members) byMember[m.id] = { publications: 0, services: 0, by_year: {}, by_type: {} };
for (const pub of publications) {
  for (const mid of pub.authors_labnet || []) {
    if (!byMember[mid]) continue;
    byMember[mid].publications += 1;
    byMember[mid].by_year[pub.year] = (byMember[mid].by_year[pub.year] || 0) + 1;
    byMember[mid].by_type[pub.type] = (byMember[mid].by_type[pub.type] || 0) + 1;
  }
}
for (const svc of services) {
  if (!byMember[svc.member_id]) continue;
  byMember[svc.member_id].services += 1;
}

// Global counts.
const pubsByYear = {};
const pubsByType = {};
const pubsByArea = {};
for (const pub of publications) {
  pubsByYear[pub.year] = (pubsByYear[pub.year] || 0) + 1;
  pubsByType[pub.type] = (pubsByType[pub.type] || 0) + 1;
  for (const a of pub.areas || []) pubsByArea[a] = (pubsByArea[a] || 0) + 1;
}

const cadenceMs = meta.cadence_days * 86400000;
const lastRefresh = new Date(meta.last_refresh + "T00:00:00Z");
const nextRefreshDate = new Date(lastRefresh.getTime() + cadenceMs);
const refreshOverdue = today > nextRefreshDate;

// Freshness: members whose last_research_date is > cadence_days old (or null)
// flag the site as having "stale researchers" — the refresh skill treats these
// as priority targets on the next run.
const staleMembers = members
  .filter((m) => m.status === "active")
  .filter((m) => {
    if (!m.last_research_date) return true;
    const d = new Date(m.last_research_date + "T00:00:00Z");
    return today - d > cadenceMs;
  })
  .map((m) => m.id);

// Sort for stable output.
publications.sort((a, b) => (b.year - a.year) || a.title.localeCompare(b.title));
services.sort((a, b) => ((b.year || b.year_end || 0) - (a.year || a.year_end || 0)) || a.title.localeCompare(b.title));

const rolePriority = {
  professor: 0, professor_associate: 1, professor_emeritus: 2,
  postdoc: 3, research_associate: 4, lab_engineer: 5,
  phd_student: 6, masters_student: 7,
  undergraduate_researcher: 8, tcc_student: 9,
  alumni: 99,
};
members.sort((a, b) => (rolePriority[a.role] ?? 50) - (rolePriority[b.role] ?? 50) || a.name.localeCompare(b.name));

const output = {
  generated_at: new Date().toISOString(),
  meta: {
    ...meta,
    next_refresh: nextRefreshDate.toISOString().slice(0, 10),
    refresh_overdue: refreshOverdue,
    stale_members: staleMembers,
  },
  tags,
  members,
  publications,
  services,
  counts: {
    members: members.length,
    members_active: members.filter((m) => m.status === "active").length,
    publications: publications.length,
    services: services.length,
    by_member: byMember,
    publications_by_year: pubsByYear,
    publications_by_type: pubsByType,
    publications_by_area: pubsByArea,
  },
};

const outDir = join(ROOT, "web/data");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "site.json"), JSON.stringify(output, null, 2));

console.log(`✓ web/data/site.json — ${members.length} member(s), ${publications.length} publication(s), ${services.length} service(s)${refreshOverdue ? " · refresh OVERDUE" : ""}`);
if (staleMembers.length) {
  console.log(`  · ${staleMembers.length} member(s) with stale research: ${staleMembers.join(", ")}`);
}
