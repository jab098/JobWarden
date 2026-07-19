import {
  onboardingAnswersSchema,
  type OnboardingAnswers,
  type OnboardingPath,
  type OnboardingStep,
} from "@jobwarden/domain";

/**
 * Which answers each step owns. The database merges one step's slice into the
 * stored answers rather than replacing them, so a step must declare every field
 * it controls — otherwise unticking every box would read as "not answered" and
 * silently keep the previous selection.
 *
 * A target role and seniority are asked on `preferences` for the CV path,
 * because that path never reaches `aspirations` and evidence alone says what
 * someone can do, never what they want to do next.
 */
export function fieldsForStep(
  path: OnboardingPath,
  step: OnboardingStep,
): readonly (keyof OnboardingAnswers)[] {
  if (step === "aspirations") {
    return [
      "roleFamilies",
      "skillConcepts",
      "developingSkills",
      "targetSeniority",
    ];
  }
  if (step === "preferences") {
    return [
      ...(path === "cv"
        ? (["roleFamilies", "targetSeniority"] as const)
        : ([] as const)),
      "employmentTypes",
      "workingTimes",
      "workplaceTypes",
      "ir35Statuses",
      "ukLocations",
      "compensationMinimum",
      "compensationPeriod",
      "allowUnknownCompensation",
    ];
  }
  if (step === "notifications") {
    return ["notificationsEnabled", "exploreEnabled"];
  }
  return [];
}

/**
 * Comma or newline separated free text becomes a deduplicated list. People type
 * these as prose, so trailing separators and repeated entries are expected
 * input rather than an error worth rejecting the whole step over.
 */
export function splitConceptList(raw: string): string[] {
  const seen = new Map<string, string>();
  for (const part of raw.split(/[,\n]/)) {
    const value = part.trim();
    if (value === "") continue;
    const key = value.toLocaleLowerCase("en-GB");
    if (!seen.has(key)) seen.set(key, value);
  }
  return [...seen.values()];
}

/**
 * Salary is entered in whole pounds because that is how adverts are written,
 * and stored in minor units because that is how every job record holds it.
 * A blank field clears the floor rather than pinning it at zero.
 */
export function parsePoundsToMinorUnits(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const pounds = Number(trimmed);
  if (!Number.isFinite(pounds) || pounds < 0) return null;
  return Math.round(pounds) * 100;
}

type FormEntries = {
  get(name: string): string;
  getAll(name: string): string[];
};

/**
 * Builds the answer slice a single step submitted. Only the step's own fields
 * are produced, so the database merge cannot overwrite an answer this step
 * never put to the user. Returns null when the submission does not satisfy the
 * answer schema, so the caller reports an invalid step rather than storing
 * something the final profile build would choke on.
 */
export function readStepAnswers(
  path: OnboardingPath,
  step: OnboardingStep,
  form: FormEntries,
): OnboardingAnswers | null {
  const fields = fieldsForStep(path, step);
  if (fields.length === 0) return {};

  const draft: Record<string, unknown> = {};
  for (const field of fields) {
    switch (field) {
      case "roleFamilies":
      case "skillConcepts":
      case "developingSkills":
      case "ukLocations":
        draft[field] = splitConceptList(form.get(field));
        break;
      case "employmentTypes":
      case "workingTimes":
      case "workplaceTypes":
      case "ir35Statuses":
        draft[field] = form.getAll(field);
        break;
      case "targetSeniority":
      case "compensationPeriod": {
        // Both vocabularies carry an explicit "not answered" member, and the
        // key is always written: omitting it would leave the merge holding the
        // answer the user just cleared.
        const value = form.get(field);
        const unanswered =
          field === "targetSeniority" ? "unspecified" : "unknown";
        draft[field] = value === "" ? unanswered : value;
        break;
      }
      case "compensationMinimum":
        draft[field] = parsePoundsToMinorUnits(form.get(field));
        break;
      case "allowUnknownCompensation":
      case "notificationsEnabled":
      case "exploreEnabled":
        // An unticked checkbox submits nothing, and on a step that always
        // renders it that absence is a real "no".
        draft[field] = form.get(field) === "on";
        break;
    }
  }

  // A floor and its period apply together or not at all, exactly as the search
  // page refuses a half-answered one. Storing £45,000 against an unknown period
  // would save a floor the matching gate then discards without telling anyone.
  if (
    draft.compensationMinimum !== undefined &&
    (draft.compensationPeriod === undefined ||
      draft.compensationPeriod === "unknown")
  ) {
    draft.compensationMinimum = null;
  }

  const parsed = onboardingAnswersSchema.safeParse(draft);
  return parsed.success ? parsed.data : null;
}
