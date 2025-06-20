# @lukecunningham/scaffold

Scaffold is a Node.js CLI (published on npm) that automates creating and configuring GitHub repositories from simple YAML “recipes.” You can combine multiple recipes, seed from a local folder or template repo, set up branches and protection rules, wire in secrets, and even bootstrap a new Projen-powered project—all with one command.

## Installation

**Globally**  
```bash
npm install -g @lukecunningham/scaffold
```

**Or with npx**  
```bash
npx @lukecunningham/scaffold <recipe…> <target>
```

## Quickstart

1. Place one or more recipe files in `./recipes/` (see schema below).
2. Run:  
   ```bash
   npx @lukecunningham/scaffold scratch my-org/my-repo
   ```
   This will:
   - Create `my-org/my-repo` on GitHub (or use a template repo if `source.repo` is set).
   - Seed it from a local folder if `source.dir` is set.
   - Push `main` and `dev` branches.
   - Apply branch protection (CI contexts, approval counts, strict mode).
   - Add Actions secrets (from environment or via prompt).
   - If the recipe has a `project:` section, generate `.projenrc.js` and run `npx projen`.

3. (Optional) Mark the new repo as a **Template repository** in GitHub settings.

## Usage

```bash
scaffold <recipe-or-path> [<recipe-or-path> …] <target>
```

- **`<recipe-or-path>`**  
  - Name of a file in `./recipes/<name>.yaml`, or  
  - Path to any YAML file.  
  Multiple recipes are merged in order (later values override earlier ones).

- **`<target>`**  
  - `owner/repo` to create on GitHub, or  
  - A local path (e.g. `.`) to scaffold into an existing directory.

## Recipe Schema

Recipes live under `recipes/` and look like this:

```yaml
source:
  # Choose one:
  # repo: your-org/base-template
  dir: ../seed-templates/base-boilerplate

github:
  owner: lukegordoncunningham
  visibility: public

  branches:
    default:     main
    integration: dev

  protection:
    contexts:
      - lint
      - test
      - build
    approvals:
      dev:  1
      main: 2
    strict:             true
    dismissStaleReviews: true
    enforceAdmins:      true

  secrets:
    - name:    VERCEL_TOKEN
      fromEnv: VERCEL_TOKEN

project:
  type:                 NextjsProject
  defaultReleaseBranch: main
  packageManager:       NPM
  deps:
    - react
    - react-dom
    - next
  devDeps:
    - eslint
    - prettier
    - tailwindcss
    - postcss
    - autoprefixer
  eslint:               true
  prettier:             true
```

- **`source`**  
  - `repo`: a GitHub template repository (`owner/name`)  
  - `dir`: a local folder whose contents are committed as the starter files

- **`github`**  
  - `owner`, `visibility`: passed to `gh repo create`  
  - `branches`: names for the default and integration branches  
  - `protection`: settings for `gh api ... /branches/<branch>/protection`  
  - `secrets`: list of `{ name, fromEnv }` entries—secrets are read from the environment (or prompted) and injected via `gh secret set`

- **`project`** (optional)  
  Any Projen project options matching the constructor for the given `type`. If present, Scaffold will render a `.projenrc.js` and run `npx projen` so you get `package.json`, ESLint, workflows, lockfiles, etc., all generated for you.

## Secrets Handling

Scaffold checks `process.env[FROM_ENV]` for each `secrets:` entry.  
If a variable is missing, it will prompt you to enter it.  
You can keep your own `.env` (in `.gitignore`) if you’d like local persistence.

## Projen Examples

If you want to use Projen to generate your starter, add a `project:` block:

```yaml
# recipes/nextjs-sass.yaml
source:
  repo: your-org/nextjs-sass-template

github:
  owner: your-org
  # … same as above …

project:
  type:                 NextjsProject
  defaultReleaseBranch: main
  packageManager:       NPM
  deps:
    - react
    - react-dom
    - next
  devDeps:
    - sass
    - eslint
    - prettier
  eslint:               true
  prettier:             true
```

Scaffold will generate a `.projenrc.js` using those options, run `npx projen`, and commit the results.

## Local Development

1. Clone with HTTPS:
   ```bash
   git clone https://github.com/lukegordoncunningham/scaffold.git
   cd scaffold
   ```
2. Install & synth:
   ```bash
   npm install
   npx projen
   ```
3. Test:
   ```bash
   GITHUB_TOKEN=ghp_xxx VERCEL_TOKEN=vercel_yyy      npx scaffold scratch ./test-output
   ```

## Contributing

1. Add or update recipes in `recipes/`.  
2. Edit `bin/scaffold.js` for new features.  
3. Run tests or add new ones.  
4. Bump version and `npm publish --access public`.
