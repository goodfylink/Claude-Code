export default {
  type: "local",
  name: "fork",
  description: "Unavailable in the restored source tree.",
  supportsNonInteractive: false,
  async load() {
    throw new Error("Fork command is unavailable in the restored source tree.");
  },
};
