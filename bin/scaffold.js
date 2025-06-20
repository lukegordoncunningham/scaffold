#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const inquirer = require('inquirer');
const { Octokit } = require('@octokit/rest');
const { $ } = require('zx');
const deepmerge = require('deepmerge');

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

async function loadRecipes(refs) {
  let merged = {};
  for (const ref of refs) {
    let recipePath;
    if (fs.existsSync(ref)) {
      recipePath = ref;
    } else {
      recipePath = path.resolve(__dirname, '../recipes', `${ref}.yaml`);
    }
    if (!fs.existsSync(recipePath)) {
      console.error(`Recipe not found: ${recipePath}`);
      process.exit(1);
    }
    const content = fs.readFileSync(recipePath, 'utf8');
    const r = yaml.load(content);
    merged = deepmerge(merged, r);
  }
  return merged;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: scaffold <recipe> [<recipe> …] <target>');
    process.exit(1);
  }
  const targets = args.slice(-1);
  const recipeRefs = args.slice(0, -1);
  const target = targets[0];

  const recipe = await loadRecipes(recipeRefs);

  // Determine if target is local path or GitHub repo
  const isLocal = target === '.' || fs.existsSync(target);
  const workdir = isLocal ? path.resolve(process.cwd(), target) : null;
  const repoName = isLocal ? path.basename(workdir) : target;

  // Ensure GitHub token
  await getSecret('GITHUB_TOKEN');
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

  // Ensure other secrets
  if (recipe.github && recipe.github.secrets) {
    for (const s of recipe.github.secrets) {
      const val = await getSecret(s.fromEnv);
      await $`gh secret set ${s.name} --body="${val}"`;
    }
  }

  // Create or initialize repo/workdir
  if (!isLocal) {
    const tpl = recipe.source && recipe.source.repo
      ? `--template ${recipe.source.repo}`
      : '';
    await $`gh repo create ${recipe.github.owner}/${repoName} --${recipe.github.visibility} ${tpl} --confirm`;
    await $`git clone https://github.com/${recipe.github.owner}/${repoName}.git`;
    process.chdir(repoName);
  } else {
    fs.mkdirSync(workdir, { recursive: true });
    process.chdir(workdir);
    if (!fs.existsSync(path.join(workdir, '.git'))) {
      await $`git init`;
    }
  }

  const mainBranch = recipe.github.branches.default;
  const devBranch  = recipe.github.branches.integration;

  // Seed from local directory
  if (recipe.source && recipe.source.dir) {
    const srcDir = path.resolve(__dirname, '..', recipe.source.dir);
    await $`cp -R ${srcDir}/. .`;
    await $`git add .`;
    await $`git commit -m "chore: seed from ${recipe.source.dir}"`;
    if (!isLocal) await $`git push origin ${mainBranch}`;
  }

  // Create and push integration branch
  await $`git checkout -b ${devBranch}`;
  if (!isLocal) await $`git push -u origin ${devBranch}`;

  // Protect branches
  if (recipe.github && recipe.github.protection) {
    const p = recipe.github.protection;
    for (const branch of [devBranch, mainBranch]) {
      const approvals = (p.approvals && p.approvals[branch]) || 0;
      await $`gh api repos/${recipe.github.owner}/${repoName}/branches/${branch}/protection \
        -f required_status_checks.strict=${p.strict} \
        -f required_status_checks.contexts='${JSON.stringify(p.contexts)}' \
        -f required_pull_request_reviews.dismiss_stale_reviews=${p.dismissStaleReviews} \
        -f required_pull_request_reviews.required_approving_review_count=${approvals} \
        -f enforce_admins=${p.enforceAdmins}`;
    }
  }

  // Optional Projen synthesis
  if (recipe.project) {
    const opts = recipe.project;
    const rc = `const { ${opts.type}, NodePackageManager } = require('projen');\n` +
               `const project = new ${opts.type}(${JSON.stringify({
      defaultReleaseBranch: opts.defaultReleaseBranch,
      packageManager: `NodePackageManager.${opts.packageManager}`,
      deps: opts.deps,
      devDeps: opts.devDeps,
      eslint: opts.eslint,
      prettier: opts.prettier,
    }, null, 2).replace(/"NodePackageManager\.(.*?)"/g, 'NodePackageManager.$1')});\n` +
               `project.synth();\n`;
    fs.writeFileSync('.projenrc.js', rc);
    await $`npx projen`;
    await $`git add . && git commit -m "chore: synth project via Projen"`;
    if (!isLocal) await $`git push`;
  }

  console.log(`Repository ready: ${repoName}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
