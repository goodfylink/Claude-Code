export function isSnipBoundaryMessage(message) {
  return Boolean(message && message.type === "system" && message.subtype === "snip_boundary");
}

export function snipCompactIfNeeded(messages) {
  return {
    messages,
    changed: false,
  };
}
