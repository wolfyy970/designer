import { l as getSystemPromptBody, o as getSkillBody } from "./hypothesis-request-schemas-C0hkg4kC.js";
import "./feature-flags-XVIYZipX.js";
import "zod";
import "../[[...route]].js";
import "@hono/node-server/vercel";
import "hono";
import "hono/cors";
import "hono/body-limit";
import "dotenv";
import "node:path";
import "node:fs/promises";
import "yaml";
import "@mariozechner/pi-ai";
import "@mariozechner/pi-coding-agent";
import "./registry-B7is6TUr.js";
import "./openrouter-budget-B6nu86e7.js";
import "./model-capabilities--LonKxeT.js";
import "just-bash";
import "node:perf_hooks";
import "./log-store-BzjCnWkn.js";
import "node:fs";
import "@sinclair/typebox";
import "node:vm";
import "minimatch";
import "./thinking-defaults-BkNuccwq.js";
const INCUBATOR_USER_INPUTS_TEMPLATE = `Analyze the following design specification and produce a dimension map with hypothesis strategies.

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
const DESIGNER_HYPOTHESIS_INPUTS_TEMPLATE = `Generate a design implementing the following hypothesis, grounded in the specification context below.

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
const GLUE_TEMPLATES = {
  "incubator-user-inputs": INCUBATOR_USER_INPUTS_TEMPLATE,
  "designer-hypothesis-inputs": DESIGNER_HYPOTHESIS_INPUTS_TEMPLATE
};
async function getPromptBody(key) {
  if (key === "designer-agentic-system") {
    return getSystemPromptBody("designer-agentic-system");
  }
  const glue = GLUE_TEMPLATES[key];
  if (glue !== void 0) return glue;
  return getSkillBody(key);
}
export {
  getPromptBody
};
