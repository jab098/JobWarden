/**
 * Deterministic skill recognition for a job listing.
 *
 * A curated vocabulary of well-known skills and tools, matched whole-word and
 * case-insensitively against a job's title and description. This is not an
 * exhaustive taxonomy and does not try to be — it surfaces the recognisable
 * skills a reader would scan for, so the job-detail page can lift them out of
 * the wall of description text and mark which ones the reader already has. No
 * model call: matching is local and deterministic per `AGENTS.md`.
 *
 * Each entry has a display `label` and the surface forms to search for. Short,
 * ambiguous names (R, Go, C) are deliberately absent: whole-word matching them
 * paints a false skill onto any advert that happens to use the word.
 */
interface RecognisedSkill {
  label: string;
  /** Surface forms to match, lowercased. The label itself is always included. */
  match?: readonly string[];
}

const recognisedSkills: readonly RecognisedSkill[] = [
  // Languages
  { label: "JavaScript", match: ["javascript", "js"] },
  { label: "TypeScript", match: ["typescript"] },
  { label: "Python", match: ["python"] },
  { label: "Java", match: ["java"] },
  { label: "Kotlin", match: ["kotlin"] },
  { label: "Swift", match: ["swift"] },
  { label: "Ruby", match: ["ruby"] },
  { label: "PHP", match: ["php"] },
  { label: "Scala", match: ["scala"] },
  { label: "Rust", match: ["rust"] },
  { label: "C++", match: ["c\\+\\+"] },
  { label: "C#", match: ["c#"] },
  { label: "SQL", match: ["sql"] },
  { label: "Bash", match: ["bash"] },
  { label: "PowerShell", match: ["powershell"] },
  { label: "VBA", match: ["vba"] },
  { label: "SAS", match: ["sas"] },
  // Frontend
  { label: "React", match: ["react", "react.js", "reactjs"] },
  { label: "Angular", match: ["angular"] },
  { label: "Vue", match: ["vue", "vue.js", "vuejs"] },
  { label: "Svelte", match: ["svelte"] },
  { label: "Next.js", match: ["next.js", "nextjs"] },
  { label: "Redux", match: ["redux"] },
  { label: "Tailwind", match: ["tailwind"] },
  { label: "HTML", match: ["html"] },
  { label: "CSS", match: ["css"] },
  { label: "Sass", match: ["sass", "scss"] },
  { label: "GraphQL", match: ["graphql"] },
  // Backend / frameworks
  { label: "Node.js", match: ["node.js", "nodejs", "node"] },
  { label: "Express", match: ["express.js", "express"] },
  { label: "Django", match: ["django"] },
  { label: "Flask", match: ["flask"] },
  { label: "FastAPI", match: ["fastapi"] },
  { label: "Spring", match: ["spring boot", "spring"] },
  { label: "Rails", match: ["rails", "ruby on rails"] },
  { label: "Laravel", match: ["laravel"] },
  { label: ".NET", match: ["\\.net", "asp.net", "dotnet"] },
  // Data / warehouses / BI
  { label: "Snowflake", match: ["snowflake"] },
  { label: "BigQuery", match: ["bigquery"] },
  { label: "Redshift", match: ["redshift"] },
  { label: "Databricks", match: ["databricks"] },
  { label: "dbt", match: ["dbt"] },
  { label: "Airflow", match: ["airflow"] },
  { label: "Spark", match: ["spark", "pyspark"] },
  { label: "Hadoop", match: ["hadoop"] },
  { label: "Kafka", match: ["kafka"] },
  { label: "Fivetran", match: ["fivetran"] },
  { label: "Looker", match: ["looker"] },
  { label: "Tableau", match: ["tableau"] },
  { label: "Power BI", match: ["power bi", "powerbi"] },
  { label: "Qlik", match: ["qlik", "qlikview"] },
  { label: "Google Analytics", match: ["google analytics", "ga4"] },
  { label: "Adobe Analytics", match: ["adobe analytics"] },
  { label: "Mixpanel", match: ["mixpanel"] },
  { label: "Amplitude", match: ["amplitude"] },
  { label: "Segment", match: ["segment"] },
  { label: "Tealium", match: ["tealium"] },
  { label: "Pandas", match: ["pandas"] },
  { label: "NumPy", match: ["numpy"] },
  { label: "Excel", match: ["excel"] },
  // Databases
  { label: "PostgreSQL", match: ["postgresql", "postgres"] },
  { label: "MySQL", match: ["mysql"] },
  { label: "MongoDB", match: ["mongodb", "mongo"] },
  { label: "Redis", match: ["redis"] },
  { label: "DynamoDB", match: ["dynamodb"] },
  { label: "Elasticsearch", match: ["elasticsearch"] },
  { label: "Oracle", match: ["oracle"] },
  { label: "SQL Server", match: ["sql server"] },
  // Cloud / DevOps
  { label: "AWS", match: ["aws", "amazon web services"] },
  { label: "Azure", match: ["azure"] },
  { label: "Google Cloud", match: ["google cloud", "gcp"] },
  { label: "Docker", match: ["docker"] },
  { label: "Kubernetes", match: ["kubernetes", "k8s"] },
  { label: "Terraform", match: ["terraform"] },
  { label: "Ansible", match: ["ansible"] },
  { label: "Jenkins", match: ["jenkins"] },
  { label: "Git", match: ["git"] },
  { label: "Linux", match: ["linux"] },
  { label: "Datadog", match: ["datadog"] },
  // ML / AI
  { label: "TensorFlow", match: ["tensorflow"] },
  { label: "PyTorch", match: ["pytorch"] },
  { label: "scikit-learn", match: ["scikit-learn", "sklearn"] },
  { label: "Machine Learning", match: ["machine learning"] },
  { label: "Deep Learning", match: ["deep learning"] },
  { label: "NLP", match: ["nlp", "natural language processing"] },
  // Marketing
  { label: "Google Tag Manager", match: ["google tag manager", "gtm"] },
  { label: "HubSpot", match: ["hubspot"] },
  { label: "Marketo", match: ["marketo"] },
  { label: "Salesforce", match: ["salesforce"] },
  { label: "SEO", match: ["seo"] },
  { label: "SEM", match: ["sem"] },
  { label: "PPC", match: ["ppc"] },
  // PM / design / collaboration
  { label: "Jira", match: ["jira"] },
  { label: "Confluence", match: ["confluence"] },
  { label: "Figma", match: ["figma"] },
  { label: "Photoshop", match: ["photoshop"] },
  { label: "Notion", match: ["notion"] },
  { label: "Agile", match: ["agile"] },
  { label: "Scrum", match: ["scrum"] },
  { label: "Kanban", match: ["kanban"] },
  // Methods / concepts
  { label: "REST", match: ["rest", "restful"] },
  { label: "Microservices", match: ["microservices", "microservice"] },
  { label: "CI/CD", match: ["ci/cd", "cicd"] },
  { label: "ETL", match: ["etl"] },
  { label: "Reverse ETL", match: ["reverse etl"] },
  { label: "Data Modeling", match: ["data modeling", "data modelling"] },
  { label: "Data Governance", match: ["data governance"] },
  { label: "A/B Testing", match: ["a/b testing", "a/b test", "ab testing"] },
  {
    label: "Data Visualization",
    match: ["data visualization", "data visualisation"],
  },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compiled once: for each skill, a single alternation of its surface forms with
 * boundaries that treat `+`, `#`, `.` and `/` inside a form as literal skill
 * characters. A form that already carries a regex escape (`c\+\+`, `\.net`) is
 * used verbatim; a plain form is escaped.
 */
const compiled: readonly { label: string; pattern: RegExp }[] =
  recognisedSkills.map((skill) => {
    const forms = [skill.label.toLowerCase(), ...(skill.match ?? [])].map(
      (form) => (/[\\]/.test(form) ? form : escapeRegExp(form)),
    );
    const alternation = [...new Set(forms)].join("|");
    return {
      label: skill.label,
      // Boundaries exclude alphanumerics either side, so "java" never fires
      // inside "javascript" and "sql" never inside "mysql".
      pattern: new RegExp(
        `(?<![a-z0-9+#])(?:${alternation})(?![a-z0-9+#])`,
        "i",
      ),
    };
  });

/**
 * The recognised skills a job names, in order of first appearance in its text,
 * de-duplicated by canonical label. `text` should be the title and description
 * joined; matching is case-insensitive and whole-word.
 */
export function extractJobSkills(text: string): string[] {
  const found: { label: string; index: number }[] = [];
  for (const { label, pattern } of compiled) {
    const match = pattern.exec(text);
    if (match) found.push({ label, index: match.index });
  }
  return found
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.label);
}

/** Lowercased, trimmed, for comparing a job skill to a reader's own skills. */
export function normaliseSkill(value: string): string {
  return value.trim().toLowerCase();
}

function firstMatchIndex(text: string, pattern: RegExp): number | null {
  const match = pattern.exec(text);
  return match ? match.index : null;
}

function userSkillPattern(term: string): RegExp {
  return new RegExp(
    `(?<![a-z0-9+#])${escapeRegExp(term.trim())}(?![a-z0-9+#])`,
    "i",
  );
}

export interface JobSkillMatch {
  label: string;
  /** Whether the reader already lists this skill on their profile. */
  mine: boolean;
}

/**
 * The skills a job names, each flagged for whether the reader has it, ordered by
 * first appearance. The reader's own skills are matched too — not only the
 * curated vocabulary — so a skill they carry that the vocabulary does not know
 * ("Tag management") still surfaces in green when the advert asks for it. On a
 * tie the reader's own label and casing win.
 */
export function matchJobSkills(
  text: string,
  userSkills: readonly string[],
): JobSkillMatch[] {
  const byKey = new Map<
    string,
    { label: string; mine: boolean; index: number }
  >();

  for (const raw of userSkills) {
    const label = raw.trim();
    if (!label) continue;
    const index = firstMatchIndex(text, userSkillPattern(label));
    if (index === null) continue;
    const key = normaliseSkill(label);
    const existing = byKey.get(key);
    if (!existing || index < existing.index) {
      byKey.set(key, { label, mine: true, index });
    }
  }

  for (const { label, pattern } of compiled) {
    const index = firstMatchIndex(text, pattern);
    if (index === null) continue;
    const key = normaliseSkill(label);
    const existing = byKey.get(key);
    if (existing) {
      // The reader keeps ownership (`mine`), but the vocabulary's canonical
      // casing wins for display, so a lowercased "sql" reads as "SQL".
      existing.label = label;
      if (index < existing.index) existing.index = index;
      continue;
    }
    byKey.set(key, { label, mine: false, index });
  }

  return [...byKey.values()]
    .sort((left, right) => left.index - right.index)
    .map(({ label, mine }) => ({ label, mine }));
}
