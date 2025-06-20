#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const inquirer = require('inquirer');
const { Octokit } = require('@octokit/rest');
const { $ } = require('zx');

async function getSecret(envVar) {
  if (!process.env[envVar]) {
    const answer = await inquirer.prompt({
      type: 'password',
      name: 'val',
      message: `${envVar} is missing—please enter it:`,
      mask: '*',
      validate: v => !!v || `${envVar} cannot be empty`,
    });
    process.env[envVar] = answer.val;
    // optionally save to .env
    const envPath = path.resolve(process.cwd(), '.env');
    const { save } = await inquirer.prompt({
      type: 'confirm',
      name: 'save',
      message: `Save ${envVar} to .env for future runs?`,
      default: false,
    });
    if (save) {
      const line = `\n${envVar}=${answer.val.replace(/\n/g, '')}`;
      fs.appendFileSync(envPath, line);
      console.log(`→ Saved ${envVar} to ${envPath}`);
    }
  }
  return process.env[envVar];
}

async function main() {
  const [,, recipeName, repoName] = process.argv;
  if (!recipeName || !repoName) {
    console.error('Usage: scaffold <recipe> <repo>');
    process.exit(1);
  }

  // Load recipe YAML
  const recipePath = path.resolve(__dirname, '../recipes', `${recipeName}.yaml`);
  if (!fs.existsSync(recipePath)) {
    console.error(`Recipe not found: ${recipePath}`);
    process.exit(1);
  }
  const recipe = yaml.load(fs.readFileSync(recipePath, 'utf8'));

  // Ensure GitHub token
  await getSecret('GITHUB_TOKEN');
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

  // Ensure other secrets
  if (recipe.github.secrets) {
    for (const s of recipe.github.secrets) {
      const val = await getSecret(s.fromEnv);
      await $`gh secret set ${s.name} --body="${val}"`;
    }
  }

  // Create repository (empty or from template)
  let templateArg = '';
  if (recipe.source && recipe.source.repo) {
    templateArg = `--template ${recipe.source.repo}`;
  }
  await $`gh repo create ${recipe.github.owner}/${repoName} --${recipe.github.visibility} ${templateArg} --confirm`;

  // Clone and enter
  await $`git clone git@github.com:${recipe.github.owner}/${repoName}.git`;
  process.chdir(repoName);

  const mainBranch = recipe.github.branches.default;
  const devBranch  = recipe.github.branches.integration;

  // Seed from local directory if provided
  if (recipe.source && recipe.source.dir) {
    const srcDir = path.resolve(__dirname, '..', recipe.source.dir);
    await $`cp -R ${srcDir}/. .`;
    await $`git add .`;
    await $`git commit -m "chore: seed from ${recipe.source.dir}"`;
    await $`git push origin ${mainBranch}`;
  }

  // Create and push integration branch
  await $`git checkout -b ${devBranch}`;
  await $`git push -u origin ${devBranch}`;

  // Apply branch protection rules
  if (recipe.github.protection) {
    const p = recipe.github.protection;
    for (const branch of [devBranch, mainBranch]) {
      const requiredApprovals = p.approvals[branch] ?? 0;
      await $`gh api repos/${recipe.github.owner}/${repoName}/branches/${branch}/protection \
        -f required_status_checks.strict=${p.strict} \
        -f required_status_checks.contexts='${JSON.stringify(p.contexts)}' \
        -f required_pull_request_reviews.dismiss_stale_reviews=${p.dismissStaleReviews} \
        -f required_pull_request_reviews.required_approving_review_count=${requiredApprovals} \
        -f enforce_admins=${p.enforceAdmins}`;
    }
  }

  // Optional: Projen project synthesis
  if (recipe.project) {
    const { type, defaultReleaseBranch, packageManager, deps, devDeps, eslint, prettier } = recipe.project;
    const rc = `const { ${type}, NodePackageManager } = require('projen');
const project = new ${type}(${JSON.stringify({
      defaultReleaseBranch,
      packageManager: `NodePackageManager.${packageManager}`,
      deps,
      devDeps,
      eslint,
      prettier,
    }, null, 2).replace(/"NodePackageManager\.(.*?)"/g, 'NodePackageManager.$1')});
project.synth();`;
    fs.writeFileSync('.projenrc.js', rc);
    await $`npx projen`;
    await $`git add . && git commit -m "chore: synth project via Projen" && git push`;
  }

  console.log(`✅ Repository created: ${recipe.github.owner}/${repoName}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
