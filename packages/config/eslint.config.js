// Shared ESLint flat-config base for Mountain Dew Group workspaces.
//
// Linting is intentionally lightweight in this repository. To adopt it in a
// workspace, install `eslint` plus any framework plugins and extend this file,
// e.g.:
//
//   import base from '@mdg/config/eslint';
//   export default [...base];
//
// Keeping the base dependency-free means it can be imported without pulling in
// a specific ESLint version.

export default [
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
    },
  },
];
