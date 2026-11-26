import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('../src/renderer/src/platform/desktop', () => ({ desktop: { data: vi.fn() } }))
import { desktop } from '../src/renderer/src/platform/desktop'
import { useEditorStore, documentKey, isDirty } from '../src/renderer/src/features/editor/store'
import type { ProjectDocument } from '../src/shared/editor-contracts'
const doc = (path: string, text: string, version: string): ProjectDocument => ({
  path,
  status: 'text',
  text,
  version: version.repeat(64),
  bytes: text.length,
})
const rpc = vi.mocked(desktop.data)
beforeEach(() => {
  rpc.mockReset()
  useEditorStore.setState({ documents: {}, active: {}, visible: {}, error: null })
})
it('keeps project buffers separate and preserves dirty text when the disk changes', async () => {
  rpc
    .mockResolvedValueOnce(doc('a.ts', 'first', 'a'))
    .mockResolvedValueOnce(doc('a.ts', 'second', 'b'))
  await useEditorStore.getState().open('project-a', 'a.ts')
  useEditorStore.getState().edit('project-a', 'a.ts', 'unsaved')
  await useEditorStore.getState().open('project-b', 'a.ts')
  rpc.mockResolvedValueOnce(doc('a.ts', 'external', 'c'))
  await useEditorStore.getState().refresh('project-a')
  const buffers = useEditorStore.getState().documents
  expect(buffers[documentKey('project-a', 'a.ts')].text).toBe('unsaved')
  expect(buffers[documentKey('project-a', 'a.ts')].disk?.text).toBe('external')
  expect(buffers[documentKey('project-b', 'a.ts')].text).toBe('second')
})
it('retains typing performed while a save is in flight and bases the next save on the saved version', async () => {
  rpc.mockResolvedValueOnce(doc('a.ts', 'first', 'a'))
  await useEditorStore.getState().open('project', 'a.ts')
  useEditorStore.getState().edit('project', 'a.ts', 'snapshot')
  let finish!: (value: Awaited<ReturnType<typeof desktop.data>>) => void
  rpc.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const saving = useEditorStore.getState().save('project', 'a.ts')
  useEditorStore.getState().edit('project', 'a.ts', 'new typing')
  finish({
    saved: true,
    document: doc('a.ts', 'snapshot', 'b'),
    error: null,
    recoveryPath: 'backup',
  })
  expect(await saving).toBe(true)
  const current = useEditorStore.getState().documents[documentKey('project', 'a.ts')]
  expect(current.text).toBe('new typing')
  expect(current.base.version).toBe('b'.repeat(64))
  expect(isDirty(current)).toBe(true)
})
it('does not let a late refresh overwrite the result of a newer save', async () => {
  rpc.mockResolvedValueOnce(doc('a.ts', 'first', 'a'))
  await useEditorStore.getState().open('project', 'a.ts')
  let finish!: (value: Awaited<ReturnType<typeof desktop.data>>) => void
  rpc.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const refreshing = useEditorStore.getState().refresh('project')
  useEditorStore.getState().edit('project', 'a.ts', 'saved')
  rpc.mockResolvedValueOnce({
    saved: true,
    document: doc('a.ts', 'saved', 'b'),
    error: null,
    recoveryPath: null,
  })
  await useEditorStore.getState().save('project', 'a.ts')
  finish(doc('a.ts', 'stale', 'a'))
  await refreshing
  expect(useEditorStore.getState().documents[documentKey('project', 'a.ts')].base.text).toBe(
    'saved',
  )
})
