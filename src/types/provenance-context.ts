/** Provenance payload assembled before `/api/generate` — UI-agnostic shape. */
export interface ProvenanceContext {
  strategies: Record<
    string,
    {
      name: string;
      hypothesis: string;
      rationale: string;
      dimensionValues: Record<string, string>;
    }
  >;
  designSystemSnapshot?: string;
}
