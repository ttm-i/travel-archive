export function useRegisterSW() {
  return {
    offlineReady: [false, () => undefined] as const,
    needRefresh: [false, () => undefined] as const,
    updateServiceWorker: () => Promise.resolve(),
  }
}
