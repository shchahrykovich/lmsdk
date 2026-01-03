import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'
import tseslint from 'typescript-eslint'
import {globalIgnores} from 'eslint/config'

export default tseslint.config([
	globalIgnores(['dist', 'worker-configuration.d.ts', 'src/components/ui/**']),
	{
		files: ['**/*.{ts,tsx}'],
		ignores: ['**/*.d.ts', 'tests/**', 'vitest.config.ts', 'drizzle.config.ts'],
		extends: [
			js.configs.recommended,
			...tseslint.configs.recommendedTypeChecked,
			...tseslint.configs.stylisticTypeChecked,
			reactX.configs['recommended-typescript'],
			reactDom.configs.recommended,
			reactHooks.configs['recommended-latest'],
			reactRefresh.configs.vite,
		],
		rules: {
			'@typescript-eslint/no-unused-vars': 'warn',
			'@typescript-eslint/consistent-indexed-object-style': 'warn',
			'@typescript-eslint/no-unsafe-assignment': 'warn',
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/no-unsafe-call': 'warn',
			'@typescript-eslint/no-unsafe-member-access': 'warn',
			'@typescript-eslint/no-unsafe-argument': 'warn',
			'@typescript-eslint/prefer-optional-chain': 'warn',
			'@typescript-eslint/prefer-nullish-coalescing': 'warn',
			'@typescript-eslint/consistent-type-definitions': 'warn',
			'@typescript-eslint/no-inferrable-types': 'warn',
			'@typescript-eslint/no-unnecessary-type-assertion': 'warn',
			'@typescript-eslint/unbound-method': 'warn',
			'@typescript-eslint/no-empty-function': 'warn',
			'@typescript-eslint/no-unsafe-return': 'warn',
			'@typescript-eslint/await-thenable': 'warn',
			'@typescript-eslint/no-misused-promises': 'warn',
			'@typescript-eslint/prefer-for-of': 'warn',
			'@typescript-eslint/no-floating-promises': 'warn',
			'@typescript-eslint/no-redundant-type-constituents': 'warn',
			'max-lines-per-function': ['error', { max: 120, skipBlankLines: true, skipComments: true }],
			'max-lines': ['error', { max: 1200, skipBlankLines: true, skipComments: true }],
		},
		languageOptions: {
			ecmaVersion: 2020,
			globals: globals.browser,
			parserOptions: {
				projectService: {
					allowDefaultProject: ['auth.ts'],
				},
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{
		files: [
			'src/pages/**/*.{ts,tsx}',
			'src/components/**/*.{ts,tsx}',
			'src/layouts/**/*.{ts,tsx}',
			'src/hooks/**/*.{ts,tsx}',
		],
		rules: {
			'max-lines-per-function': ['error', { max: 700, skipBlankLines: true, skipComments: true }],
		},
	},
	{
		// Relaxed rules for shared config files not in any tsconfig
		files: ['auth.ts'],
		rules: {
			'@typescript-eslint/require-await': 'off',
			'@typescript-eslint/prefer-nullish-coalescing': 'off',
		},
	},
])
