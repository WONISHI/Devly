import { Check, Loader2, TerminalSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { useEnvironment } from '../hooks/use-environment'

type EnvironmentPanelProps = ReturnType<typeof useEnvironment>

export function EnvironmentPanel({
  environment,
  loading,
  environmentError,
  refreshEnvironment,
}: EnvironmentPanelProps) {
  return (
    <section className="environment-section">
      <div className="section-header">
        <div>
          <span className="eyebrow">ENVIRONMENT</span>
          <h2>开发环境</h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={loading}
          onClick={() => void refreshEnvironment()}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : '重新检查'}
        </Button>
      </div>
      {environmentError && (
        <p className="error-text" role="alert">
          {environmentError}
        </p>
      )}
      <div className="environment-grid">
        {[
          ['Electron', environment?.electron],
          ['Node.js · 应用运行时', environment?.node],
          ['Git', environment?.git],
          ['运行平台', environment?.platform],
        ].map(([label, value]) => (
          <div className="environment-item" key={label}>
            <div className="environment-icon">
              {value ? <Check size={15} /> : <TerminalSquare size={15} />}
            </div>
            <div>
              <span>{label}</span>
              <p>{value ?? (loading ? '检查中…' : '未检测到')}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
