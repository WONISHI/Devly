import type { ReactNode } from 'react'

export type SettingsGroupId = 'providers' | 'appearance' | 'models' | 'permissions' | 'developer'
export function SettingsGroup({
  id,
  title,
  description,
  children,
}: {
  id: SettingsGroupId
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section
      id={`settings-group-${id}`}
      className="settings-group"
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
