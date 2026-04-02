export default {
  type: "local",
  name: "peers",
  description: "Unavailable in the restored source tree.",
  supportsNonInteractive: false,
  async load() {
    throw new Error("Peers command is unavailable in the restored source tree.");
  },
};
