export type JobSourceOption = {
  id: string;
  /** What the user sees: the employer board or provider name. */
  label: string;
  provider: string;
};

export type SourcesResult = {
  sources: readonly JobSourceOption[];
  dataMode: "supabase" | "fixtures";
};
