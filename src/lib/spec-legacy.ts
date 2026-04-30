import type { DesignSpec, SpecSection } from '../types/spec';

export const LEGACY_EXISTING_DESIGN_SECTION_ID = 'existing-design';

export function stripLegacyExistingDesignSection(spec: DesignSpec): DesignSpec {
  if (!spec.sections[LEGACY_EXISTING_DESIGN_SECTION_ID]) return spec;
  const { [LEGACY_EXISTING_DESIGN_SECTION_ID]: _removed, ...sections } = spec.sections;
  void _removed;
  return {
    ...spec,
    sections: sections as Record<string, SpecSection>,
  };
}

