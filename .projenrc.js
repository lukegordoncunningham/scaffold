const { javascript } = require('projen');

const project = new javascript.NodeProject({
  name: '@lukecunningham/scaffold',
  defaultReleaseBranch: 'main',

  // Runtime dependencies for CLI functionality
  deps: [
    'commander',      // CLI argument parsing
    'inquirer',       // interactive prompts
    'js-yaml',        // YAML config loading
    '@octokit/rest',  // GitHub API
    'zx',             // shell scripting helper
  ],

  // Dev dependencies for development tooling
  devDeps: [
    'typescript',
    'eslint',
    'jest',
    'ts-jest',
    '@types/jest',
    '@types/node',
  ],

  // Define your CLI entrypoint
  bin: {
    scaffold: 'bin/scaffold.js',
  },

  // Linting & formatting
  eslint: true,
  prettier: true,

  // TypeScript configuration
  tsconfig: {
    compilerOptions: {
      target: 'ES2020',
      module: 'commonjs',
      outDir: 'lib',
      rootDir: 'src',
      strict: true,
      esModuleInterop: true,
    },
    include: ['src'],
  },

  // GitHub & CI integrations
  github: true,
  githubOptions: {
    pullRequestLintOptions: {
      semanticTitle: true,
    },
  },

  release: true,
  dependabot: true,
});

project.synth();
