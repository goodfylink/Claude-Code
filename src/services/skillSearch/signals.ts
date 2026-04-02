export const DISCOVERY_SIGNALS = [
  'turn_zero_input',
  'assistant_turn',
  'subagent_spawn',
  'hidden_by_main_turn',
] as const

export type DiscoverySignal = (typeof DISCOVERY_SIGNALS)[number]
