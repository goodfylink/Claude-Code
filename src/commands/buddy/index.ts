export default {
  type: "local",
  name: "buddy",
  description: "Unavailable in the restored source tree.",
  supportsNonInteractive: false,
  async load() {
    throw new Error("Buddy command is unavailable in the restored source tree.");
  },
};
