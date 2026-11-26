import { useEffect, useId, useState } from 'react'
import Editor, { DiffEditor, type OnMount } from '@monaco-editor/react'
import { Button } from '@/components/ui/button'
import { desktop } from '@/platform/desktop'
import type { ProjectDiff, ProjectDocument } from '@shared/editor-contracts'
import {
  useEditorStore,
  documentKey,
  modelUri,
  isDirty,
  type BufferDocument,
  type EditorMode,
} from './store'
import { language, monaco } from './monaco'
const statuses: Record<ProjectDocument['status'], string> = {
  text: '',
  missing: '文件不存在或已被删除',
  binary: '二进制文件，暂不支持文本预览',
  too_large: '文件超过 256 KiB，未加载到编辑器',
  encoding: '文件不是有效 UTF-8，未转换或覆盖原文件',
  denied: '受保护、忽略或敏感文件，未读取内容',
  unavailable: '文件无法读取，请刷新后重试',
}
function DiffView({
  projectId,
  document,
  mode,
  revision,
  theme,
}: {
  projectId: string
  document: BufferDocument
  mode: EditorMode
  revision: number
  theme: string
}) {
  const instance = useId()
  const [result, setResult] = useState<ProjectDiff | null>(null),
    [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (mode !== 'git') return
    let active = true
    void desktop
      .data('editor.diff', { projectId, path: document.path })
      .then((value) => {
        if (active) {
          setResult(value)
          setError(null)
        }
      })
      .catch((error) => {
        if (active) setError(error instanceof Error ? error.message : '差异读取失败')
      })
    return () => {
      active = false
    }
  }, [projectId, document.path, mode, revision])
  let original: ProjectDocument, modified: ProjectDocument, label: string
  if (mode === 'git') {
    if (error)
      return (
        <p role="alert" className="editor-notice">
          {error}
        </p>
      )
    if (!result)
      return (
        <p className="editor-notice" role="status">
          加载实际 Git 差异…
        </p>
      )
    if (!result.available)
      return (
        <p className="editor-notice">
          Git 基线不可用。文件编辑仍可使用；未保存内容可与打开时版本比较。
        </p>
      )
    original = result.original
    modified = result.modified
    label = `HEAD → 磁盘（不含未保存内容）${result.oldPath ? ` · 重命名 ${result.oldPath} → ${result.path}` : ''}`
  } else {
    original = mode === 'conflict' ? (document.disk ?? document.base) : document.base
    modified = { ...document.base, text: document.text, status: 'text' }
    label =
      mode === 'conflict'
        ? '当前磁盘 → 本地未保存内容；不会自动覆盖'
        : '打开时版本 → 本地未保存内容'
  }
  const supported = (value: ProjectDocument) => ['text', 'missing'].includes(value.status)
  if (!supported(original) || !supported(modified))
    return (
      <div className="editor-notice">
        <p>此项不能显示文本 Diff。</p>
        <p>
          原版本：{statuses[original.status] || '文本'}；当前版本：
          {statuses[modified.status] || '文本'}
        </p>
      </div>
    )
  return (
    <>
      <p className="editor-diff-label">
        {label}
        {original.status === 'missing' ? ' · 新增文件' : ''}
        {modified.status === 'missing' ? ' · 文件已删除' : ''}
      </p>
      <div className="monaco-host" data-editor-diff={document.path}>
        <DiffEditor
          original={original.text ?? ''}
          modified={modified.text ?? ''}
          language={language(document.path)}
          theme={theme}
          originalModelPath={`${modelUri(projectId, document.path)}?diff=${encodeURIComponent(instance)}-original`}
          modifiedModelPath={`${modelUri(projectId, document.path)}?diff=${encodeURIComponent(instance)}-modified`}
          keepCurrentOriginalModel
          keepCurrentModifiedModel
          onMount={(editor) => {
            const models = editor.getModel()
            // The wrapper disposes models before detaching its Diff widget by default.
            // Wait until widget disposal finishes; instance-specific URIs prevent a later view sharing them.
            editor.onDidDispose(() => {
              setTimeout(() => {
                models?.original.dispose()
                models?.modified.dispose()
              }, 0)
            })
          }}
          options={{
            readOnly: true,
            originalEditable: false,
            automaticLayout: true,
            minimap: { enabled: false },
            occurrencesHighlight: 'off',
            renderSideBySide: true,
            scrollBeyondLastLine: false,
            renderOverviewRuler: false,
          }}
          loading={<p className="editor-notice">加载本地 Diff 编辑器…</p>}
        />
      </div>
    </>
  )
}
export default function EditorPane({
  projectId,
  revision,
}: {
  projectId: string
  revision: number
}) {
  const state = useEditorStore(),
    target = state.active[projectId]
  const document = target ? state.documents[documentKey(projectId, target.path)] : null
  const [theme, setTheme] = useState(() =>
    window.document.documentElement.classList.contains('dark') ? 'vs-dark' : 'light',
  )
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setTheme(window.document.documentElement.classList.contains('dark') ? 'vs-dark' : 'light'),
    )
    observer.observe(window.document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    return () => observer.disconnect()
  }, [])
  const onMount: OnMount = (editor) => {
    const current = useEditorStore.getState().active[projectId]
    const buffer = current
      ? useEditorStore.getState().documents[documentKey(projectId, current.path)]
      : null
    // The React wrapper reuses models on mount; synchronize the authoritative buffer after reload/Diff.
    const visibleText = buffer?.text.replace(/^\uFEFF/, '')
    if (visibleText !== undefined && editor.getValue() !== visibleText) editor.setValue(visibleText)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      const current = useEditorStore.getState().active[projectId]
      if (current) void useEditorStore.getState().save(projectId, current.path)
    })
  }
  if (!document || !target)
    return (
      <div className="editor-empty">
        <p>从文件树选择文件</p>
        <p>本地编辑器与 Worker，无需 CDN。</p>
      </div>
    )
  const dirty = isDirty(document),
    readOnly = desktop.getPlatform() !== 'darwin'
  return (
    <section className="editor-pane" aria-label="项目编辑器">
      <div className="editor-file-actions">
        <span title={document.path}>{document.path}</span>
        <Button
          variant={target.mode === 'file' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => void state.open(projectId, document.path, 'file')}
        >
          编辑
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void state.open(projectId, document.path, 'git')}
        >
          Git Diff
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!dirty}
          onClick={() => void state.open(projectId, document.path, 'draft')}
        >
          比较未保存
        </Button>
        <Button
          size="sm"
          disabled={readOnly || !dirty || document.saving || document.base.status !== 'text'}
          onClick={() => void state.save(projectId, document.path)}
        >
          {document.saving ? '保存中…' : '保存'}
        </Button>
      </div>
      {document.disk && (
        <div className="editor-conflict" role="status">
          磁盘文件已变更{document.disk.status === 'missing' ? '或删除' : ''}，本地编辑仍保留。
          <Button
            variant="link"
            size="sm"
            onClick={() => void state.open(projectId, document.path, 'conflict')}
          >
            比较外部更改
          </Button>
        </div>
      )}
      {document.error && (
        <p className="editor-error" role="alert">
          {document.error}
        </p>
      )}
      {readOnly && <p className="editor-notice">此平台的编辑保存尚未验收，当前为只读预览。</p>}
      {target.mode === 'file' ? (
        document.base.status === 'text' ? (
          <div className="monaco-host" data-editor-file={document.path}>
            <Editor
              key={modelUri(projectId, document.path)}
              path={modelUri(projectId, document.path)}
              value={document.text.replace(/^\uFEFF/, '')}
              language={language(document.path)}
              theme={theme}
              keepCurrentModel
              saveViewState
              onMount={onMount}
              onChange={(value) => {
                const current =
                  useEditorStore.getState().documents[documentKey(projectId, document.path)]
                const text = value ?? ''
                state.edit(
                  projectId,
                  document.path,
                  current?.text.startsWith('\uFEFF') && !text.startsWith('\uFEFF')
                    ? '\uFEFF' + text
                    : text,
                )
              }}
              options={{
                readOnly,
                automaticLayout: true,
                minimap: { enabled: false },
                occurrencesHighlight: 'off',
                scrollBeyondLastLine: false,
                fontSize: 13,
                tabSize: 2,
                wordWrap: 'off',
                unicodeHighlight: { ambiguousCharacters: false },
                padding: { top: 12 },
                renderValidationDecorations: 'on',
              }}
              loading={<p className="editor-notice">加载本地编辑器…</p>}
            />
          </div>
        ) : (
          <p className="editor-notice" role="status">
            {statuses[document.base.status]}
          </p>
        )
      ) : (
        <DiffView
          key={`${projectId}:${document.path}:${target.mode}`}
          projectId={projectId}
          document={document}
          mode={target.mode}
          revision={revision}
          theme={theme}
        />
      )}
      <p className="editor-footnote">
        {dirty ? '未保存 · ' : ''}
        {document.base.bytes !== null ? `${document.base.bytes} bytes · ` : ''}UTF-8 ·{' '}
        {language(document.path)} · 语言服务只覆盖已打开的本地模型，不读取 node_modules/项目
        tsconfig。
      </p>
    </section>
  )
}
