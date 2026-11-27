import { expect, it, vi } from 'vitest'
vi.mock('../src/renderer/src/platform/desktop', () => ({ desktop: { data: vi.fn() } }))
import { desktop } from '../src/renderer/src/platform/desktop'
import { useLayoutStore } from '../src/renderer/src/features/desktop/layout-store'
import { defaultLayout, layoutSchema } from '../src/shared/workbench-contracts'
it('merges early user layout changes over a late database response and saves the merged value', async () => {
  const rpc = vi.mocked(desktop.data),
    id = '00000000-0000-4000-8000-000000000001'
  let complete!: (value: Awaited<ReturnType<typeof desktop.data>>) => void
  rpc.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve
      }),
  )
  const loading = useLayoutStore.getState().load(id)
  useLayoutStore.getState().patch(id, { sidebar: 300 })
  rpc.mockResolvedValueOnce({ ...defaultLayout, sidebar: 300, showEditor: true })
  complete({ ...defaultLayout, sidebar: 210, showEditor: true })
  await loading
  expect(useLayoutStore.getState().layouts[id]).toMatchObject({ sidebar: 300, showEditor: true })
  expect(rpc).toHaveBeenLastCalledWith('layout.save', {
    projectId: id,
    layout: { ...defaultLayout, sidebar: 300, showEditor: true },
  })
})
it('rejects invalid dimensions and foreign layout fields', () => {
  expect(layoutSchema.safeParse({ ...defaultLayout, sidebar: 0 }).success).toBe(false)
  expect(layoutSchema.safeParse({ ...defaultLayout, terminal: 80 }).success).toBe(false)
  expect(layoutSchema.safeParse({ ...defaultLayout, apiKey: 'not-a-key' }).success).toBe(false)
})
