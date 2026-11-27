import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker&inline'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker&inline'
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker&inline'
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker&inline'
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker&inline'
import { useEditorStore } from './store'

self.MonacoEnvironment = {
  getWorker(_id, label) {
    if (label === 'json') return new JsonWorker()
    if (['css', 'scss', 'less'].includes(label)) return new CssWorker()
    if (['html', 'handlebars', 'razor'].includes(label)) return new HtmlWorker()
    if (['typescript', 'javascript'].includes(label)) return new TsWorker()
    return new EditorWorker()
  },
}
loader.config({ monaco })
monaco.editor.defineTheme('devly-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#1c1d1f',
    'editor.foreground': '#e6e7e8',
    'editorGutter.background': '#1c1d1f',
  },
})
monaco.editor.defineTheme('devly-light', {
  base: 'vs',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#fafafa',
    'editor.foreground': '#202226',
    'editorGutter.background': '#fafafa',
  },
})
monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
  validate: true,
  enableSchemaRequest: false,
  schemas: [],
})
monaco.languages.typescript.typescriptDefaults.setEagerModelSync(false)
monaco.languages.typescript.javascriptDefaults.setEagerModelSync(false)
monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
  allowNonTsExtensions: true,
  target: monaco.languages.typescript.ScriptTarget.ESNext,
  module: monaco.languages.typescript.ModuleKind.ESNext,
  noEmit: true,
})
useEditorStore.setState({
  disposeModel: (uri) => monaco.editor.getModel(monaco.Uri.parse(uri))?.dispose(),
})
export function language(path: string) {
  const extension = path.split('.').pop()?.toLowerCase() ?? ''
  return (
    (
      {
        ts: 'typescript',
        tsx: 'typescript',
        js: 'javascript',
        jsx: 'javascript',
        json: 'json',
        css: 'css',
        scss: 'scss',
        less: 'less',
        html: 'html',
        md: 'markdown',
        py: 'python',
        rs: 'rust',
        go: 'go',
        vue: 'html',
        sh: 'shell',
        yaml: 'yaml',
        yml: 'yaml',
        sql: 'sql',
        xml: 'xml',
      } as Record<string, string>
    )[extension] ?? 'plaintext'
  )
}
export { monaco }
