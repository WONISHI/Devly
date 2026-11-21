import { useEffect, useRef, useState } from 'react'
import type { EnvironmentInfo } from '@shared/contracts'
import { desktop } from '@/platform/desktop'

export function useEnvironment() {
  const [environment, setEnvironment] = useState<EnvironmentInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [environmentError, setEnvironmentError] = useState<string | null>(null)

  const requestVersion = useRef(0)

  async function refreshEnvironment() {
    const version = ++requestVersion.current
    setLoading(true)
    setEnvironmentError(null)
    try {
      const info = await desktop.getEnvironment()
      if (version === requestVersion.current) setEnvironment(info)
    } catch (error) {
      if (version === requestVersion.current)
        setEnvironmentError(error instanceof Error ? error.message : '环境检查失败')
    } finally {
      if (version === requestVersion.current) setLoading(false)
    }
  }
  useEffect(() => {
    let active = true
    const version = ++requestVersion.current
    const request = desktop.getEnvironment()
    request
      .then((info) => {
        if (active && version === requestVersion.current) setEnvironment(info)
      })
      .catch((error: unknown) => {
        if (active && version === requestVersion.current)
          setEnvironmentError(error instanceof Error ? error.message : '环境检查失败')
      })
      .finally(() => {
        if (active && version === requestVersion.current) setLoading(false)
      })
    return () => {
      active = false
      requestVersion.current++
    }
  }, [])

  return {
    environment,
    loading,
    environmentError,
    refreshEnvironment,
    isMac: desktop.getPlatform() === 'darwin',
  }
}
