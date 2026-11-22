import type { ReactNode } from 'react'

export type SettingsGroupId =
  'providers' | 'usage' | 'appearance' | 'models' | 'permissions' | 'developer'
export type PreferenceGroupId = Exclude<SettingsGroupId, 'providers' | 'usage' | 'developer'>
export function SettingsGroup({
  id,
  title,
  description,
  children,
  hidden = false,
}: {
  id: SettingsGroupId
  title: string
  description: string
  children: ReactNode
  hidden?: boolean
}) {
  return (
    <section
      id={`settings-group-${id}`}
      className="settings-group"
      hidden={hidden}
      aria-labelledby={`settings-group-${id}-title`}
    >
      <header className="settings-group-heading">
        <h2 id={`settings-group-${id}-title`}>{title}</h2>
        <p>{description}</p>
      </header>
      {children}
    </section>
  )
}
