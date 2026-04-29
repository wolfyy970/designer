function generateId() {
  return crypto.randomUUID();
}
function now() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function interpolate(template, vars) {
  return template.replace(
    /\{\{(\w+)\}\}/g,
    (match, key) => key in vars ? vars[key] : match
  );
}
function getSectionContent(spec, sectionId) {
  const section = spec.sections[sectionId];
  if (!section) return "(Not provided)";
  return section.content.trim() || "(Not provided)";
}
function collectImageLines(spec) {
  return Object.values(spec.sections).flatMap((s) => s.images).filter((img) => img.description.trim()).map((img) => `- [${img.filename}]: ${img.description}`);
}
export {
  generateId as a,
  collectImageLines as c,
  getSectionContent as g,
  interpolate as i,
  now as n
};
