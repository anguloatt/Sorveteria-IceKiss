// This file mocks the Firebase SDK modules imported from the CDN.
// Since the function under test is pure and doesn't use the actual SDK,
// we just need to export an empty object to satisfy Jest's module resolver.
module.exports = {};