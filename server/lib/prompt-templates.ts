/**
 * Structural glue templates — pure XML wrappers around {{VARIABLE}} placeholders.
 *
 * These templates contain ZERO behavioral guidance. All behavioral nuance
 * (how to interpret inputs, what to prioritize, quality expectations) lives
 * in the corresponding skill or system prompt:
 *
 * - Incubator nuance → skills/hypotheses-generator-system/SKILL.md
 * - Hypothesis nuance → skills/design-generation/SKILL.md + prompts/designer-agentic-system/PROMPT.md
 *
 * If you need to add guidance about how inputs are interpreted, put it in the
 * skill, not here.
 */

export const INCUBATOR_USER_INPUTS_TEMPLATE = `Analyze the following design specification and produce a dimension map with hypothesis strategies.

<specification title="{{SPEC_TITLE}}">

<design_brief>
{{DESIGN_BRIEF}}
</design_brief>

<existing_design>
{{EXISTING_DESIGN}}
</existing_design>

<research_context>
{{RESEARCH_CONTEXT}}
</research_context>

<objectives_metrics>
{{OBJECTIVES_METRICS}}
</objectives_metrics>

<design_constraints>
{{DESIGN_CONSTRAINTS}}
</design_constraints>

{{IMAGE_BLOCK}}

{{INTERNAL_CONTEXT_DOCUMENT_BLOCK}}

{{DESIGN_SYSTEM_DOCUMENTS_BLOCK}}

</specification>

Produce the dimension map as JSON.{{REFERENCE_DESIGNS_BLOCK}}{{EXISTING_HYPOTHESES_BLOCK}}{{INCUBATOR_HYPOTHESIS_COUNT_LINE}}`;

export const DESIGNER_HYPOTHESIS_INPUTS_TEMPLATE = `Generate a design implementing the following hypothesis, grounded in the specification context below.

<hypothesis>
<name>{{STRATEGY_NAME}}</name>
<bet>{{HYPOTHESIS}}</bet>
<rationale>{{RATIONALE}}</rationale>
<measurements>{{MEASUREMENTS}}</measurements>
<dimension_values>
{{DIMENSION_VALUES}}
</dimension_values>
</hypothesis>

<specification>

<design_brief>
{{DESIGN_BRIEF}}
</design_brief>

<research_context>
{{RESEARCH_CONTEXT}}
</research_context>

{{IMAGE_BLOCK}}

<objectives_metrics>
{{OBJECTIVES_METRICS}}
</objectives_metrics>

<design_constraints>
{{DESIGN_CONSTRAINTS}}
</design_constraints>

<design_system>
{{DESIGN_SYSTEM}}
</design_system>

</specification>`;
