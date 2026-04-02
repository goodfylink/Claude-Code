export function isConnectorTextBlock(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      "type" in value &&
      (value.type === "connector_text" || value.type === "connector-text"),
  );
}
