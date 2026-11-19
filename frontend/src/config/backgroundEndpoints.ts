// Automatic calls the user did not trigger (start-of-shift attendance):
// they must never open a confirmation or error window.
export const isBackgroundEndpoint = (endpoint: string) =>
  /\/users\/me\/clock-in(?:\?|$)/.test(endpoint);
