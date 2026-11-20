export const shouldDeferRealtimeRefresh = (activeTagName?: string, modalOpen = false) =>
  ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTagName || '') || modalOpen;
