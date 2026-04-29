const OPENROUTER_CREDIT_EXHAUSTED_MESSAGE = "OpenRouter credits are exhausted. This run cannot continue until the budget resets.";
function isOpenRouterCreditExhaustionLike(value) {
  const text = value instanceof Error ? value.message : typeof value === "string" ? value : value != null ? JSON.stringify(value) : "";
  const msg = text.toLowerCase();
  if (!msg) return false;
  return msg.includes("insufficient credits") || msg.includes("out of credits") || msg.includes("402") && (msg.includes("openrouter") || msg.includes("api key") || msg.includes("account")) || msg.includes("limit_remaining") && msg.includes("0");
}
function normalizeOpenRouterCreditError(value) {
  return isOpenRouterCreditExhaustionLike(value) ? OPENROUTER_CREDIT_EXHAUSTED_MESSAGE : void 0;
}
export {
  OPENROUTER_CREDIT_EXHAUSTED_MESSAGE as O,
  normalizeOpenRouterCreditError as n
};
