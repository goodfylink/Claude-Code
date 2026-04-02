export function isSnipBoundaryMessage(message) {
  return Boolean(message && message.type === "system" && message.subtype === "snip_boundary");
}

export function projectSnippedMessages(messages) {
  return messages;
}
