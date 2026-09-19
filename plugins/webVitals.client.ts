export default defineNuxtPlugin(() => {
  // Skip admin and preview routes
  const route = useRoute()
  if (route.path.startsWith('/admin') || route.path.startsWith('/__preview')) {
    return
  }

  const buffer: Array<{
    name: string
    value: number
    pageUrl: string
    deviceType: string
    connectionType?: string
    navigationType?: string
  }> = []

  let flushTimer: ReturnType<typeof setTimeout> | null = null

  function getDeviceType(): string {
    return window.innerWidth < 768 ? 'mobile' : 'desktop'
  }

  function getConnectionType(): string | undefined {
    const nav = navigator as any
    return nav.connection?.effectiveType ?? undefined
  }

  function flush() {
    if (buffer.length === 0) return
    const metrics = buffer.splice(0, buffer.length)
    const payload = JSON.stringify({ metrics })
    const blob = new Blob([payload], { type: 'application/json' })

    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/web-vitals', blob)
    } else {
      fetch('/api/web-vitals', {
        method: 'POST',
        body: payload,
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      }).catch(() => {})
    }

    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
  }

  function scheduleFlush() {
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = setTimeout(flush, 3000)
  }

  function onMetric(metric: { name: string; value: number }) {
    buffer.push({
      name: metric.name,
      value: metric.value,
      pageUrl: window.location.pathname,
      deviceType: getDeviceType(),
      connectionType: getConnectionType(),
      navigationType: (performance.getEntriesByType?.('navigation')?.[0] as any)?.type ?? undefined,
    })

    if (buffer.length >= 10) {
      flush()
    } else {
      scheduleFlush()
    }
  }

  // Flush on page hide
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flush()
    }
  })

  // Dynamically import web-vitals to keep it out of the critical path
  import('web-vitals').then(({ onLCP, onINP, onCLS, onFCP, onTTFB }) => {
    onLCP(onMetric)
    onINP(onMetric)
    onCLS(onMetric)
    onFCP(onMetric)
    onTTFB(onMetric)
  }).catch(() => {
    // web-vitals not available, silently fail
  })
})
