/** Chart/identity colors for the dark theme. Checked with a palette validator against the #141416 surface. */
export const SERIES = {
  inbound: '#199e70',
  outbound: '#9085e9'
};

/** Categorical slots in fixed order; a stage keeps its color by position everywhere. */
const STAGE_SLOTS = ['#3987e5', '#c98500', '#9085e9', '#199e70', '#d95926', '#d55181'];

export function stageColor(index: number): string {
  return STAGE_SLOTS[index % STAGE_SLOTS.length];
}

export const INK = {
  primary: '#f3f0ea',
  secondary: '#918f89',
  muted: '#6f6e69',
  grid: '#232327'
};
