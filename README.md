# Scaffold (npx @lukecunningham/scaffold)

Scaffold is a Node.js CLI (published on npm) that automates creating and configuring GitHub repositories from simple YAML “recipes.” You can combine multiple recipes, seed from a local folder or template repo, set up branches and protection rules, wire in secrets, and even bootstrap a new Projen-powered project—all with one command.

---

## Installation

**Globally**  
```bash
npm install -g @lukecunningham/scaffold
```

**Or with npx**  
```bash
npx @lukecunningham/scaffold <recipe…> <target>
```

---

## Quickstart

Run the CLI with one or more recipes and a target:

```bash
npx @lukecunningham/scaffold blank.yaml my-org/my-repo
```

This will:
- Create `my-org/my-repo` on GitHub (or use a template repo if `source.repo` is set).
- Seed it from a local folder if `source.dir` is set.
- Push `main` and `dev` branches.
- Apply branch protection (CI contexts, approval counts, strict mode).
- Add GitHub Actions secrets (from environment or via prompt).
- If the recipe has a `project:` section, generate a `.projenrc.js` and run `npx projen`.

Optionally, mark the new repo as a **Template repository** in GitHub settings.

---

## Usage

```bash
scaffold <recipe-or-path> [<recipe-or-path> …] <target>
```

- **`<recipe-or-path>`**
  - A name from `./recipes/<name>.yaml` (omit the `.yaml`), or
  - A filesystem path to any YAML file.
  You can pass multiple recipes; they will be merged in order, with later values taking precedence.

- **`<target>`**
  - `owner/repo` to create on GitHub, or
  - A local path (e.g. `.`) to scaffold into an existing directory.

---

## Recipe Schema

A recipe file (e.g. `blank.yaml`) might look like this:

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
    - name:       VERCEL_TOKEN
      fromEnv:    VERCEL_TOKEN

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
  - Settings passed straight to `gh repo create`, branch setup, protection rules, and secrets injection

- **`project`** (optional)
  Projen options that will generate a `.projenrc.js` and run `npx projen` to scaffold the project configuration.

---

## Secrets Handling

Scaffold reads each `secrets:` entry from `process.env`. If a variable is missing, the CLI will prompt you to enter it. For local convenience, you can keep a `.env` file (in `.gitignore`).

---

## Projen Examples

Add a `project:` block to your recipe to leverage Projen:

```yaml
# recipes/nextjs-sass.yaml
source:
  repo: your-org/nextjs-sass-template

github:
  owner: your-org
  # … other GitHub settings …

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

Scaffold will render `.projenrc.js`, run `npx projen`, and commit the results.

---

## Local Development

1. Clone the repo over HTTPS:
   ```bash
   git clone https://github.com/lukegordoncunningham/scaffold.git
   cd scaffold
   ```
2. Install dependencies and synth Projen setup:
   ```bash
   npm install
   npx projen
   ```
3. Test your changes:
   ```bash
   GITHUB_TOKEN=ghp_xxx VERCEL_TOKEN=vercel_yyy      npx @lukecunningham/scaffold blank.yaml ./test-output
   ```

---

## Contributing

1. Add or update recipes in `recipes/`.
2. Enhance `bin/scaffold.js` for new features.
3. Run or add tests.
4. Bump the version and `npm publish --access public`.
