import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

const sharedRules = {
  ...js.configs.recommended.rules,
  'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
}

export default [
  { ignores: ['dist', 'coverage', 'backend/node_modules'] },
  // Frontend (browser + React)
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: 'module' },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...sharedRules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  // Backend + tooling config (Node)
  {
    files: ['backend/**/*.js', '*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: globals.node },
    rules: sharedRules,
  },
]
