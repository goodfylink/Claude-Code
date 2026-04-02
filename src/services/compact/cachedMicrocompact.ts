function createState() {
  return {
    pinnedEdits: [],
    toolsSentToAPI: new Set(),
  };
}

export function createCachedMCState() {
  return createState();
}

export function createCacheEditsBlock() {
  return {
    type: "text",
    text: "",
  };
}

export function markToolsSentToAPI(state) {
  return state;
}

export function resetCachedMCState(state) {
  state.pinnedEdits = [];
  state.toolsSentToAPI = new Set();
}
