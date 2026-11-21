import { GitBranch, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from '@/components/ai-elements/conversation'
import {
  Commit,
  CommitHeader,
  CommitMessage,
  CommitHash,
  CommitContent,
  CommitFile,
  CommitFilePath,
  CommitFileStatus,
  CommitFileChanges,
  CommitFileAdditions,
  CommitFileDeletions,
} from '@/components/ai-elements/commit'
import { Tool, ToolHeader, ToolContent, ToolInput, ToolOutput } from '@/components/ai-elements/tool'
import { Message, MessageContent } from '@/components/ai-elements/message'

export function ComponentPreviewPage({ onClose }: { onClose: () => void }) {
  return (
    <div className="components-page">
      <div className="section-header">
        <div>
          <span className="eyebrow">COMPONENT LIBRARY</span>
          <h1>AI Elements</h1>
          <p className="text-muted-foreground">
            来自你选定的原版组件库 · 以下均为明确标注的演示数据
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => onClose()} aria-label="关闭预览">
          <X size={17} />
        </Button>
      </div>
      <section>
        <h2 className="preview-label">CONVERSATION / MESSAGE</h2>
        <div className="conversation-preview">
          <Conversation>
            <ConversationContent>
              <Message from="user">
                <MessageContent>演示：检查项目的工程基础。</MessageContent>
              </Message>
              <Message from="assistant">
                <MessageContent>
                  这是一条组件预览消息。真实的模型对话、审批和代码修改尚未接入。
                </MessageContent>
              </Message>
            </ConversationContent>
          </Conversation>
        </div>
      </section>
      <section>
        <h2 className="preview-label">TOOL · 演示记录</h2>
        <Tool defaultOpen>
          <ToolHeader
            type="tool-environment_check"
            state="output-available"
            title="环境检查 · 组件演示"
          />
          <ToolContent>
            <ToolInput input={{ target: 'local-workspace', mode: 'preview' }} />
            <ToolOutput
              output={<p>这是 Tool 组件的展示数据，不代表执行了 Agent 任务。</p>}
              errorText={undefined}
            />
          </ToolContent>
        </Tool>
      </section>
      <section>
        <h2 className="preview-label">COMMIT · 演示提交</h2>
        <Commit defaultOpen>
          <CommitHeader>
            <div className="flex items-center gap-3">
              <GitBranch size={16} />
              <CommitMessage>chore: initialize Devly workspace</CommitMessage>
            </div>
            <CommitHash>demo000</CommitHash>
          </CommitHeader>
          <CommitContent>
            <CommitFile>
              <CommitFileStatus status="added" />
              <CommitFilePath>src/main/index.ts</CommitFilePath>
              <CommitFileChanges>
                <CommitFileAdditions count={80} />
                <CommitFileDeletions count={0} />
              </CommitFileChanges>
            </CommitFile>
          </CommitContent>
        </Commit>
        <p className="text-xs text-muted-foreground mt-3">
          非真实 Git 提交。实际提交记录将在 Git 功能阶段接入。
        </p>
      </section>
      <div className="hidden">
        <ConversationEmptyState />
      </div>
    </div>
  )
}
