# Scaffold CLI (`@lukecunningham/scaffold`)

Scaffold is a command-line tool that makes it easy to create new GitHub repositories with a standard setup. Using a simple YAML recipe, Scaffold will:

- Create a repository (empty or from a GitHub template)
- Set up `main` and `dev` branches
- Apply branch protection rules (status checks, review requirements)
- Add necessary secrets (for example, `GITHUB_TOKEN` or `VERCEL_TOKEN`)
- Optionally generate project files using Projen
- Copy files from a local boilerplate directory if needed

## Installation

To install globally:

```bash
npm install -g @lukecunningham/scaffold
```

Or use without installing:

```bash
npx @lukecunningham/scaffold <recipe> <repo-name>
```

## Requirements

- Node.js (version 14 or higher) and npm
- GitHub CLI (`gh`), with `gh auth login` already run
- Environment variables for any secrets referenced in your recipe (e.g. `GITHUB_TOKEN`)
- (Optional) A `.env` file in the working directory for local secret storage

## Basic Usage

```bash
scaffold <recipe> <repo-name>
```

- `<recipe>`: the name of a YAML file in the `recipes/` folder (omit the `.yaml` extension)
- `<repo-name>`: the name of the new repository under the configured GitHub owner

### Example

```bash
npx @lukecunningham/scaffold scratch my-template
```

This command will:

1. Create the public repository `lukegordoncunningham/my-template`
2. Push `main` and `dev` branches
3. Apply the branch protection rules defined in `recipes/scratch.yaml`
4. Prompt for any missing secrets and store them if you choose
5. Skip Projen scaffolding since `scratch.yaml` does not include a `project` section

## Recipe Format

Recipes are YAML files placed in the `recipes/` folder. A recipe has three sections:

1. **source**: Defines where to get initial files

   - `repo`: a GitHub template (owner/repo)
   - `dir`: a local directory to copy into the new repo

2. **github**: Settings for repository creation and protection

   ```yaml
   github:
     owner: lukegordoncunningham
     visibility: public  # or private

     branches:
       default: main
       integration: dev

     protection:
       contexts: [lint, test, build]
       approvals:
         dev: 1
         main: 2
       strict: true
       dismissStaleReviews: true
       enforceAdmins: true
   ```

3. **project** (optional): Projen options for code scaffolding

   ```yaml
   project:
     type: NextjsProject
     defaultReleaseBranch: main
     packageManager: NPM
     deps: [react, react-dom, next]
     devDeps: [eslint, prettier]
     eslint: true
     prettier: true
   ```

If the `project` section is missing, Scaffold will only handle GitHub setup and seeding.

## Local Development

1. Clone this repository:
   ```bash
   git clone https://github.com/lukegordoncunningham/scaffold.git
   cd scaffold
   npm install
   npx projen
   ```
2. (Optional) Link the package to test as a global tool:
   ```bash
   npm link
   ```
3. Run a recipe locally:
   ```bash
   scaffold scratch test-repo
   ```
4. Add or update recipes in the `recipes/` folder or modify `bin/scaffold.js` for new behavior.

## Contributing

Contributions are welcome. To contribute:

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature-name`).
3. Make your changes, including tests if appropriate.
4. Commit and push your branch.
5. Open a pull request.

## License

This project is licensed under the MIT License.

