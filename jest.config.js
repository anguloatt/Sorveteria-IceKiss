module.exports = {
  // Tells Jest to use babel-jest to transform JavaScript files.
  transform: {
    '^.+\\.js$': 'babel-jest',
  },

  // A list of paths to directories that Jest should use to search for files in.
  // Adding <rootDir> allows for absolute imports from the project root (public/).
  moduleDirectories: [
    "node_modules",
    "<rootDir>"
  ],

  // A map from regular expressions to module names that allow stubbing out resources.
  moduleNameMapper: {
    // Match any import starting with the Firebase CDN URL and redirect it to a local mock file.
    '^https://www.gstatic.com/firebasejs/11.10.0/(.*)$': '<rootDir>/__mocks__/firebase.mock.js',
    
    // Mapeia os módulos locais para seus mocks. Removendo os âncoras de regex (^ e $)
    // torna o mapeamento mais flexível e resolve problemas de resolução de caminho.
    './firebase-config.js': '<rootDir>/__mocks__/firebase-config.mock.js',
  },

  // The test environment that will be used for testing. 'node' is standard for backend/logic tests.
  testEnvironment: 'node',
};