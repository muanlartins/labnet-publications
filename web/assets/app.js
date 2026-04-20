const I18N = {
  en: {
    site_name: "LabNet Publications",
    search_placeholder: "Search people, titles, venues…",
    nav_people: "People",
    nav_publications: "Publications",
    nav_services: "Service",
    last_refresh: "Last refreshed",
    next_due: "next due",
    refresh_overdue: "Refresh overdue — open in Claude Code and run",
    stale_members_suffix: "member(s) with stale research",
    members: "members",
    publications: "publications",
    services: "service records",
    pubs_count: "pubs",
    svc_count: "service",
    no_records: "No records on file yet.",
    never_researched: "Not yet researched — next refresh will populate.",
    never: "never",
    no_pubs_yet: "No publications in the database yet.",
    no_svc_yet: "No service records in the database yet.",
    no_match: "No records match the current filters.",
    hint_refresh_member: "In Claude Code: /refresh-publications <member-id>",
    filter_year: "Year",
    filter_type: "Type",
    filter_area: "Area",
    filter_author: "Author",
    filter_member: "Member",
    clear_filters: "Clear filters",
    authors: "Authors",
    venue: "Venue",
    abstract: "Abstract",
    identifiers: "Identifiers",
    last_verified: "Last verified",
    last_researched: "Last researched",
    open_source: "Open source ↗",
    role_all: "All",
    role_professor: "Professors",
    role_professor_associate: "Associate Professors",
    role_professor_emeritus: "Emeritus",
    role_postdoc: "Postdocs",
    role_phd_student: "PhD",
    role_masters_student: "Master's",
    role_undergraduate_researcher: "Undergrad (IC)",
    role_tcc_student: "Undergrad (TCC)",
    role_research_associate: "Associates",
    role_lab_engineer: "Engineers",
    role_alumni: "Alumni",
    footer_built_by: "Built and refreshed by Claude Code. Member list seeded from labnet.nce.ufrj.br/equipe.html.",
    footer_calendar: "Event calendar",
  },
  pt: {
    site_name: "Publicações do LabNet",
    search_placeholder: "Buscar pessoas, títulos, eventos…",
    nav_people: "Pessoas",
    nav_publications: "Publicações",
    nav_services: "Atuação",
    last_refresh: "Última atualização",
    next_due: "próxima em",
    refresh_overdue: "Atualização pendente — abra no Claude Code e rode",
    stale_members_suffix: "pessoa(s) com pesquisa defasada",
    members: "pessoas",
    publications: "publicações",
    services: "registros de atuação",
    pubs_count: "publ.",
    svc_count: "atuação",
    no_records: "Sem registros por enquanto.",
    never_researched: "Ainda não pesquisado — a próxima atualização irá popular.",
    never: "nunca",
    no_pubs_yet: "Ainda não há publicações no banco.",
    no_svc_yet: "Ainda não há registros de atuação no banco.",
    no_match: "Nenhum registro corresponde aos filtros.",
    hint_refresh_member: "No Claude Code: /refresh-publications <id-do-membro>",
    filter_year: "Ano",
    filter_type: "Tipo",
    filter_area: "Área",
    filter_author: "Autor(a)",
    filter_member: "Pessoa",
    clear_filters: "Limpar filtros",
    authors: "Autores",
    venue: "Veículo",
    abstract: "Resumo",
    identifiers: "Identificadores",
    last_verified: "Última verificação",
    last_researched: "Última pesquisa",
    open_source: "Abrir fonte ↗",
    role_all: "Todos",
    role_professor: "Professores",
    role_professor_associate: "Prof. Associados",
    role_professor_emeritus: "Eméritos",
    role_postdoc: "Pós-doc",
    role_phd_student: "Doutorado",
    role_masters_student: "Mestrado",
    role_undergraduate_researcher: "IC",
    role_tcc_student: "TCC",
    role_research_associate: "Associados",
    role_lab_engineer: "Engenheiros",
    role_alumni: "Ex-membros",
    footer_built_by: "Construído e atualizado pelo Claude Code. Lista de pessoas semeada a partir de labnet.nce.ufrj.br/equipe.html.",
    footer_calendar: "Calendário de eventos",
  },
};

function pubApp() {
  return {
    data: {
      members: [], publications: [], services: [],
      tags: { areas: [], publication_types: [], service_roles: [], member_roles: [], regions: [], societies: [], sources: [] },
      counts: { by_member: {}, publications_by_year: {}, publications_by_type: {}, publications_by_area: {} },
      meta: null,
    },
    view: "people",
    memberTab: "pubs",
    lang: (navigator.language || "en").startsWith("pt") ? "pt" : "en",
    q: "",
    roleFilter: "all",
    filters: { areas: [], types: [], authors: [], years: [] },
    selectedMember: null,
    selectedPub: null,
    error: null,

    async init() {
      try {
        const r = await fetch("./data/site.json", { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        Object.assign(this.data, j);
      } catch (err) {
        this.error = String(err);
        console.error("[labnet-publications] failed to load site.json:", err);
      }
    },

    t(key) {
      return (I18N[this.lang] && I18N[this.lang][key]) || (I18N.en[key] || key);
    },

    resetFilters() {
      this.filters = { areas: [], types: [], authors: [], years: [] };
      this.q = "";
    },

    toggleYear(y) {
      const i = this.filters.years.indexOf(y);
      if (i >= 0) this.filters.years.splice(i, 1);
      else this.filters.years.push(y);
    },

    pubTypeName(id) {
      const t = this.data.tags.publication_types.find((x) => x.id === id);
      if (!t) return id;
      return t["name_" + this.lang] || t.name_en;
    },

    serviceRoleName(id) {
      const r = this.data.tags.service_roles.find((x) => x.id === id);
      if (!r) return id;
      return r["name_" + this.lang] || r.name_en;
    },

    identifierLink(key, value) {
      if (!value) return null;
      switch (key) {
        case "doi":                 return `https://doi.org/${value}`;
        case "openalex_id":         return `https://openalex.org/${value}`;
        case "arxiv_id":            return `https://arxiv.org/abs/${value}`;
        case "dblp_key":            return `https://dblp.org/rec/${value}`;
        case "semantic_scholar_id": return `https://www.semanticscholar.org/paper/${value}`;
        case "sbc_sol_id": {
          const [slug, num] = String(value).split("/");
          return slug && num ? `https://sol.sbc.org.br/index.php/${slug}/article/view/${num}` : null;
        }
        default: return null;
      }
    },

    memberName(id) {
      return this.data.members.find((m) => m.id === id)?.name || id;
    },

    memberPubs(id) {
      return this.data.publications.filter((p) => (p.authors_labnet || []).includes(id));
    },

    memberPubsByYear(id) {
      const groups = {};
      for (const p of this.memberPubs(id)) {
        groups[p.year] = groups[p.year] || [];
        groups[p.year].push(p);
      }
      return Object.keys(groups).sort((a, b) => b - a).map((y) => ({ year: y, items: groups[y] }));
    },

    memberSvcs(id) {
      return this.data.services.filter((s) => s.member_id === id);
    },

    matchesPub(p) {
      if (this.filters.years.length && !this.filters.years.includes(p.year)) return false;
      if (this.filters.types.length && !this.filters.types.includes(p.type)) return false;
      if (this.filters.areas.length && !(p.areas || []).some((a) => this.filters.areas.includes(a))) return false;
      if (this.filters.authors.length && !(p.authors_labnet || []).some((m) => this.filters.authors.includes(m))) return false;
      if (this.q) {
        const q = this.q.toLowerCase();
        const hay = [p.title, p.title_en, p.title_pt, p.venue?.name, p.venue?.full_name, ...(p.authors || []).map((a) => a.name), ...(p.tags || [])].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    },

    matchesSvc(s) {
      if (this.filters.authors.length && !this.filters.authors.includes(s.member_id)) return false;
      if (this.q) {
        const q = this.q.toLowerCase();
        const hay = [s.title, s.role, s.venue?.name, s.related_work?.candidate_name, s.related_work?.title].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    },

    matchesMember(m) {
      if (this.roleFilter !== "all") {
        if (this.roleFilter === "professor" && !m.role.startsWith("professor")) return false;
        if (this.roleFilter !== "professor" && m.role !== this.roleFilter) return false;
      }
      if (this.q) {
        const q = this.q.toLowerCase();
        const hay = [m.name, m.full_name, ...(m.aliases || []), m.bio_en, m.bio_pt, m.affiliation].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    },

    get filteredMembers() {
      return this.data.members.filter((m) => this.matchesMember(m));
    },

    get filteredPublications() {
      return this.data.publications.filter((p) => this.matchesPub(p));
    },

    get filteredServices() {
      return this.data.services.filter((s) => this.matchesSvc(s));
    },

    get pubYears() {
      return [...new Set(this.data.publications.map((p) => p.year))].sort((a, b) => b - a);
    },

    get publicationsByYear() {
      const groups = {};
      for (const p of this.filteredPublications) {
        groups[p.year] = groups[p.year] || [];
        groups[p.year].push(p);
      }
      return Object.keys(groups).sort((a, b) => b - a).map((y) => ({ year: y, items: groups[y] }));
    },
  };
}

window.pubApp = pubApp;
