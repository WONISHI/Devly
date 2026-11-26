# AI Elements source provenance

- Upstream: https://github.com/vercel/ai-elements
- Commit: `ca8be600bfd01b3131f9bf6134b51602a71f4374`
- Original source: `packages/elements/src/{commit,conversation,message,tool,code-block,model-selector,prompt-input,confirmation,plan,task,shimmer}.tsx`
- Companion UI source: `packages/shadcn-ui/components/ui/`
- License: original upstream license notice retained in `LICENSE`.

These are the original AI Elements components selected by the user, not replacements from the migrated shadcn AI patterns. Local adaptation changes the upstream monorepo aliases `@repo/shadcn-ui/components/ui/` and `@repo/shadcn-ui/lib/utils` to local `@/components/ui/` and `@/lib/utils`. Companion UI files are formatted with the project's Prettier configuration. Original AI Elements files retain upstream formatting.

The eleven listed AI components are imported. PromptInput, Conversation and Message are used by ordinary chat. PromptInput companions DropdownMenu, HoverCard, InputGroup and Spinner come from this same pinned commit. nanoid 3.3.20 is an explicit dependency, reusing the already locked MIT version; no upstream AI logic was rewritten. ModelSelector is used by the workspace model picker; its companion Dialog and Command come from the same pinned commit. The Command dependency cmdk is pinned to 1.1.1 in the lockfile (MIT; React 18/19 peer range). Additional components will be imported as their features are implemented, with dependencies and provenance recorded.

Phase 6 adds original Confirmation, Plan and Task for scoped approval and runtime-derived execution records; Shimmer is Plan's original companion. Alert and Card come from the same pinned commit. motion 12.42.0 is pinned for Shimmer (MIT; React 19 peer support), with its notices included in dependency inventory. No source logic was changed; these new files pass the same upstream/local hash checks. The latest motion major is not adopted in this phase; this pinned integration has local type/build/UI validation and does not clear existing release blockers.
