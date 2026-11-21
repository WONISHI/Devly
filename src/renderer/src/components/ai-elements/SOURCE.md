# AI Elements source provenance

- Upstream: https://github.com/vercel/ai-elements
- Commit: `ca8be600bfd01b3131f9bf6134b51602a71f4374`
- Original source: `packages/elements/src/{commit,conversation,message,tool,code-block}.tsx`
- Companion UI source: `packages/shadcn-ui/components/ui/`
- License: original upstream license notice retained in `LICENSE`.

These are the original AI Elements components selected by the user, not replacements from the migrated shadcn AI patterns. Local adaptation changes the upstream monorepo aliases `@repo/shadcn-ui/components/ui/` and `@repo/shadcn-ui/lib/utils` to local `@/components/ui/` and `@/lib/utils`. Companion UI files are formatted with the project's Prettier configuration. Original AI Elements files retain upstream formatting.

Only the five listed AI components are imported in this initial setup. Additional components will be imported as their features are implemented, with their dependencies recorded in the lockfile.
