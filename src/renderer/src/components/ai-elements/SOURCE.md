# AI Elements source provenance

- Upstream: https://github.com/vercel/ai-elements
- Commit: `ca8be600bfd01b3131f9bf6134b51602a71f4374`
- Original source: `packages/elements/src/{commit,conversation,message,tool,code-block,model-selector}.tsx`
- Companion UI source: `packages/shadcn-ui/components/ui/`
- License: original upstream license notice retained in `LICENSE`.

These are the original AI Elements components selected by the user, not replacements from the migrated shadcn AI patterns. Local adaptation changes the upstream monorepo aliases `@repo/shadcn-ui/components/ui/` and `@repo/shadcn-ui/lib/utils` to local `@/components/ui/` and `@/lib/utils`. Companion UI files are formatted with the project's Prettier configuration. Original AI Elements files retain upstream formatting.

The six listed AI components are imported. ModelSelector is used by the workspace model picker; its companion Dialog and Command come from the same pinned commit. The Command dependency cmdk is pinned to 1.1.1 in the lockfile (MIT; React 18/19 peer range). Additional components will be imported as their features are implemented, with dependencies and provenance recorded.
