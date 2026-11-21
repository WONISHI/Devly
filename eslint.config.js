import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'
import hooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  {
    ignores: [
      'out/**',
      'release/**',
      'node_modules/**',
      '.cache/**',
      '.pnpm-store/**',
      'output/**',
      'src/renderer/src/components/ai-elements/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  { files: ['scripts/*.cjs'], rules: { '@typescript-eslint/no-require-imports': 'off' } },
  {
    files: ['src/renderer/**/*.tsx'],
    plugins: { 'react-hooks': hooks },
    rules: hooks.configs.recommended.rules,
  },
  {
    files: ['src/renderer/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', 'electron', 'electron/*'],
              message: 'Renderer must use the desktop gateway rather than Node or Electron APIs.',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'src/renderer/src/App.tsx',
      'src/renderer/src/app/**/*.tsx',
      'src/renderer/src/features/**/components/**/*.tsx',
      'src/renderer/src/features/component-preview/*.tsx',
      'src/renderer/src/features/provider-settings/*.tsx',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', 'electron', 'electron/*', '@/platform/*', '**/platform/**'],
              message:
                'Presentation components receive data and callbacks; platform access belongs in feature hooks.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='window'][property.name='devly']",
          message: 'Presentation components must not access the preload bridge directly.',
        },
      ],
    },
  },
  {
    files: ['src/renderer/src/App.tsx', 'src/renderer/src/features/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "JSXOpeningElement[name.type='JSXIdentifier'][name.name=/^(button|input|textarea|select|option|label|details|summary)$/]",
          message:
            '业务控件请复用 components/ui 的 Button、Input、Textarea、Select、Label、Collapsible。',
        },
        {
          selector: "MemberExpression[object.name='window'][property.name='devly']",
          message: '展示层通过 feature hook 和 platform 网关访问桌面能力。',
        },
      ],
    },
  },
)
