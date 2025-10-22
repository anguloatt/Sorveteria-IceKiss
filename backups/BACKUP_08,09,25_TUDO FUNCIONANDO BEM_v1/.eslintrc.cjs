module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2021: true
  },
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module'
  },
  rules: {
    // regras conservadoras: apenas estilo/erros simples
    'no-unused-vars': ['warn', { 'args': 'none', 'varsIgnorePattern': '^_' }],
    'no-undef': 'warn',
    'no-console': 'off'
  }
};
