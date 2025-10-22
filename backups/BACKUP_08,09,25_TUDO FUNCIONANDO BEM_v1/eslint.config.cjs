module.exports = {
  languageOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
    // declarar globals comuns do browser para evitar muitos "no-undef" warnings
    globals: {
      window: 'readonly',
      document: 'readonly',
      console: 'readonly',
      localStorage: 'readonly',
      sessionStorage: 'readonly',
      navigator: 'readonly',
      Event: 'readonly',
      Blob: 'readonly',
      URL: 'readonly',
      Audio: 'readonly',
      fetch: 'readonly',
      setTimeout: 'readonly',
      clearTimeout: 'readonly',
      prompt: 'readonly',
      confirm: 'readonly'
    }
  },
  settings: {},
  files: ['**/*.js'],
  rules: {
    'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
    'no-undef': 'warn',
    'no-console': 'off'
  }
};
