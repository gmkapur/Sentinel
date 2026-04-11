import js from '@eslint/js';
import parser from '@typescript-eslint/parser';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

const eslintConfig = [
    // JS base config
    js.configs.recommended,

    // TypeScript recommended configs
    ...tseslint.configs.recommended,

    // Custom config
    {
        files: ['**/*.{js,ts}'],
        languageOptions: {
            parser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
            },
            globals: {
                ...globals.node,
                ...globals.es2021,
            },
        },
        rules: {
            // Error detection
            'no-constant-condition': 'error',
            'no-dupe-else-if': 'error',
            'no-dupe-args': 'error',
            'no-dupe-keys': 'error',
            'no-duplicate-case': 'error',
            'no-duplicate-imports': 'error',
            'no-ex-assign': 'error',
            'no-fallthrough': 'warn',
            'no-func-assign': 'warn',
            'no-import-assign': 'error',
            'no-irregular-whitespace': [
                'error',
                {
                    skipStrings: true,
                    skipComments: true,
                    skipTemplates: true,
                },
            ],
            'no-self-assign': 'warn',
            'no-self-compare': 'warn',
            'no-template-curly-in-string': 'warn',
            'no-unmodified-loop-condition': 'warn',
            'no-unreachable': 'error',
            'no-unreachable-loop': 'warn',

            // TypeScript specific
            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                },
            ],
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-require-imports': 'off',

            // Best practices
            eqeqeq: ['error', 'always'],
            'no-console': 'off',
            'prefer-const': 'error',
            'no-with': 'error',
            'no-void': 'error',
            'no-var': 'error',
            'no-eval': 'error',

            // Async/await (important for Express)
            'no-async-promise-executor': 'error',

            // Code style
            'arrow-spacing': [
                'error',
                {
                    before: true,
                    after: true,
                },
            ],
            'block-spacing': 'error',
            'brace-style': ['error', 'stroustrup'],
            'comma-dangle': ['error', 'only-multiline'],
            'comma-spacing': 'error',
            'eol-last': 'error',
            semi: ['error', 'always'],
            quotes: [
                'error',
                'single',
                {
                    allowTemplateLiterals: true,
                },
            ],
            'no-extra-semi': 'error',
            'object-curly-spacing': ['error', 'always'],
            indent: ['error', 4],
            'key-spacing': ['error', { afterColon: true }],
            'keyword-spacing': ['error', { before: true, after: true }],
            'space-before-blocks': 'error',
        },
    },

    // React frontend config
    {
        files: ['packages/frontend/src/**/*.{ts,tsx}'],
        languageOptions: {
            parser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
                ecmaFeatures: { jsx: true },
            },
            globals: {
                ...globals.browser,
                ...globals.es2021,
            },
        },
        plugins: {
            react,
            'react-hooks': reactHooks,
        },
        rules: {
            // React rules
            'react/react-in-jsx-scope': 'off',
            'react/jsx-uses-react': 'error',
            'react/jsx-uses-vars': 'error',
            'react/jsx-no-duplicate-props': 'error',
            'react/jsx-no-undef': 'error',
            'react/jsx-key': 'error',
            'react/no-direct-mutation-state': 'error',
            'react/no-unescaped-entities': 'warn',
            'react/self-closing-comp': 'error',
            'react/jsx-curly-spacing': ['error', { when: 'always', children: true }],

            // React Hooks rules
            ...reactHooks.configs.recommended.rules,
        },
        settings: {
            react: { version: 'detect' },
        },
    },

    // Ignore patterns
    {
        ignores: ['node_modules/', 'dist/', 'build/', '*.config.js'],
    },
];

export default eslintConfig;
