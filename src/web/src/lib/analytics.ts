export function trackEvent(event: string, params?: Record<string, string>) {
  if (typeof window !== "undefined") {
    window.dataLayer = window.dataLayer || []
    window.dataLayer.push({ event, ...params })
  }
}
