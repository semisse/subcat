const js = require('@eslint/js');
const jestPlugin = require('eslint-plugin-jest');
const globals = require('globals');

module.exports = [
    js.configs.recommended,
    // Node.js source files (main process)
    {
        files: ['src/**/*.js'],
        languageOptions: {
            globals: { ...globals.node },
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
            'no-console': 'warn',
        },
    },
    // Preload — Node + limited browser (contextBridge exposes to window)
    {
        files: ['renderer/preload.js'],
        languageOptions: {
            globals: { ...globals.node },
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
        },
    },
    // Renderer — browser globals
    {
        files: ['renderer/renderer.js'],
        languageOptions: {
            globals: { ...globals.browser },
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
            'no-console': 'warn',
        },
    },
    // Tests
    {
        files: ['tests/**/*.test.js'],
        plugins: { jest: jestPlugin },
        languageOptions: {
            globals: {
                ...globals.node,
                ...jestPlugin.environments.globals.globals,
            },
        },
        rules: {
            ...jestPlugin.configs.recommended.rules,
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
        },
    },
    {
        ignores: ['node_modules/', 'dist/', 'site/'],
    },
];
