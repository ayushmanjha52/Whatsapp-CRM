/** Chart/identity colors. Validated with the dataviz palette checker (light surface). */
export const SERIES = {
  inbound: '#2563eb',
  outbound: '#eb6834'
};

/** Categorical slots in fixed order; a stage keeps its color by position everywhere. */
const STAGE_SLOTS = ['#2a78d6', '#eda100', '#4a3aa7', '#1baf7a', '#eb6834', '#e87ba4'];

export function stageColor(index: number): string {
  return STAGE_SLOTS[index % STAGE_SLOTS.length];
}

export const INK = {
  primary: '#0f172a',
  secondary: '#64748b',
  muted: '#94a3b8',
  grid: '#eef2f6'
};
