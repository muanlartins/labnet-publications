import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename, extname } from "node:path";
import yaml from "js-yaml";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const tags = yaml.load(readFileSync(join(ROOT, "data/tags.yaml"), "utf8"));

const areaIds = tags.areas.map((a) => a.id);
const publicationTypeIds = tags.publication_types.map((t) => t.id);
const serviceRoleIds = tags.service_roles.map((r) => r.id);
const memberRoleIds = tags.member_roles.map((r) => r.id);
const societyIds = tags.societies.map((s) => s.id);
const regionIds = tags.regions.map((r) => r.id);
const sourceIds = tags.sources.map((s) => s.id);

function loadSchema(file) {
  return JSON.parse(readFileSync(join(ROOT, "schema", file), "utf8"));
}

const memberSchema = loadSchema("member.schema.json");
memberSchema.properties.role.enum = memberRoleIds;
memberSchema.properties.research_areas.items.enum = areaIds;

const publicationSchema = loadSchema("publication.schema.json");
publicationSchema.properties.type.enum = publicationTypeIds;
publicationSchema.properties.areas.items.enum = areaIds;
publicationSchema.properties.venue.properties.society.enum = [...societyIds, null];
publicationSchema.properties.location.properties.region.enum = regionIds;
publicationSchema.properties.sources.items.properties.source.enum = sourceIds;

const serviceSchema = loadSchema("service.schema.json");
serviceSchema.properties.role.enum = serviceRoleIds;
serviceSchema.properties.areas.items.enum = areaIds;
if (serviceSchema.properties.venue.properties) {
  serviceSchema.properties.venue.properties.society.enum = [...societyIds, null];
}
serviceSchema.properties.location.properties.region.enum = regionIds;
serviceSchema.properties.sources.items.properties.source.enum = sourceIds;

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateMember = ajv.compile(memberSchema);
const validatePublication = ajv.compile(publicationSchema);
const validateService = ajv.compile(serviceSchema);

let errors = 0;
const fail = (file, msg) => { console.error(`  ✗ ${file}: ${msg}`); errors++; };

function loadDir(sub) {
  const dir = join(ROOT, "data", sub);
  const files = readdirSync(dir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  return files.map((file) => {
    const path = join(dir, file);
    const stem = basename(file, extname(file));
    const record = yaml.load(readFileSync(path, "utf8"));
    return { sub, file, path, stem, record };
  });
}

function validateEntity(entries, validator, label) {
  const seen = new Set();
  for (const { file, stem, record } of entries) {
    if (!record || typeof record !== "object") { fail(file, "not an object"); continue; }
    if (!validator(record)) {
      for (const e of validator.errors) fail(file, `${e.instancePath || "/"} ${e.message}`);
      continue;
    }
    if (record.id !== stem) fail(file, `id "${record.id}" does not match filename stem "${stem}"`);
    if (seen.has(record.id)) fail(file, `duplicate ${label} id "${record.id}"`);
    seen.add(record.id);
  }
  return seen;
}

const members = loadDir("members");
const publications = loadDir("publications");
const services = loadDir("services");

const memberIds = validateEntity(members, validateMember, "member");
const publicationIds = validateEntity(publications, validatePublication, "publication");
const serviceIds = validateEntity(services, validateService, "service");

for (const { file, record } of members) {
  if (record.advisor_id && !memberIds.has(record.advisor_id)) fail(file, `advisor_id "${record.advisor_id}" is not a known member`);
  if (record.coadvisor_id && !memberIds.has(record.coadvisor_id)) fail(file, `coadvisor_id "${record.coadvisor_id}" is not a known member`);
  if (record.research_areas) {
    for (const a of record.research_areas) {
      if (!areaIds.includes(a)) fail(file, `research_area "${a}" not in tags.yaml`);
    }
  }
}

for (const { file, record } of publications) {
  for (const a of record.authors || []) {
    if (a.member_id && !memberIds.has(a.member_id)) fail(file, `author.member_id "${a.member_id}" is not a known member`);
  }
  for (const m of record.authors_labnet || []) {
    if (!memberIds.has(m)) fail(file, `authors_labnet "${m}" is not a known member`);
    if (!(record.authors || []).some((a) => a.member_id === m)) fail(file, `authors_labnet "${m}" must also appear in authors[].member_id`);
  }
}

for (const { file, record } of services) {
  if (!memberIds.has(record.member_id)) fail(file, `member_id "${record.member_id}" is not a known member`);
}

if (errors > 0) {
  console.error(`\n${errors} validation error(s) across ${members.length + publications.length + services.length} record(s).`);
  process.exit(1);
}

console.log(`✓ ${members.length} member(s), ${publications.length} publication(s), ${services.length} service(s) — all valid.`);
