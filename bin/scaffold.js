#!/usr/bin/env node
/**
 * scaffold.js
 *
 * A Node.js CLI (npm: @lukecunningham/scaffold) for bootstrapping and managing
 * GitHub repositories using declarative YAML recipes.
 *
 * Usage:
 *   scaffold <recipe-or-path> [<recipe-or-path> …] [<target>]
 *
 * Behavior:
 *   • If only one recipe and no <target>, uses recipe.github.name  
 *   • If <target> contains "/", treated as "owner/repo"  
 *   • Otherwise treated as repo under recipe.github.owner  
 *   • Use "." to scaffold into current directory
 *
 * Features:
 *   • Merge multiple recipes (later overrides earlier)  
 *   • source.repo or source.dir  
 *   • Create/clone repo, push main & dev branches  
 *   • Branch protection (CI contexts, approvals, strict mode)  
 *   • Secrets injection via GH CLI (env or prompt, .env save)  
 *   • Optional Projen synthesis if recipe.project defined
 *
 * Requirements:
 *   • Node.js v14+  
 *   • GitHub CLI ('gh') installed  
 *   • Recipes in ./recipes/ or passed by path
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const inquirer = require('inquirer');
const deepmerge = require('deepmerge');
const { $ } = require('zx');

async function getSecret(envVar) {
  if (!process.env[envVar]) {
    const { val } = await inquirer.prompt({
      type: 'password',
      name: 'val',
      message: `${envVar} not set—enter value:`,
      mask: '*',
      validate: v => !!v || `${envVar} cannot be empty`,
    });
    process.env[envVar] = val;
    const envPath = path.resolve(process.cwd(), '.env');
    const { save } = await inquirer.prompt({
      type: 'confirm',
      name: 'save',
      message: `Save ${envVar} to .env for future runs?`,
      default: false,
    });
    if (save) {
      fs.appendFileSync(envPath, `
${envVar}=${val.replace(/\n/g, '')}`);
      console.log(`→ Saved ${envVar} to ${envPath}`);
    }
  }
  return process.env[envVar];
}

async function loadRecipes(refs) {
  const recipesDir = path.resolve(__dirname, '../recipes');
  let merged = {};
  for (const ref of refs) {
    let filePath = null;
    if (fs.existsSync(ref) && fs.statSync(ref).isFile()) {
      filePath = path.resolve(ref);
    } else {
      for (const ext of ['', '.yaml', '.yml', '.json', '.txt']) {
        const p = path.join(recipesDir, `${ref}${ext}`);
        if (fs.existsSync(p) && fs.statSync(p).isFile()) {
          filePath = p;
          break;
        }
      }
    }
    if (!filePath) {
      throw new Error(`Recipe not found: ${ref}`);
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const r = yaml.load(content) || {};
    merged = deepmerge(merged, r);
  }
  return merged;
}

async function main() {
  let stage = 'start';
  try {
    // Parse args
    stage = 'parsing arguments';
    const args = process.argv.slice(2);
    if (args.length < 1) {
      throw new Error('Usage: scaffold <recipe> [<recipe> …] [<target>]');
    }
    let recipeRefs, target;
    if (args.length === 1) {
      recipeRefs = args;
    } else {
      recipeRefs = args.slice(0, -1);
      target = args[args.length - 1];
    }

    // Load recipes
    stage = 'loading recipes';
    const recipe = await loadRecipes(recipeRefs);

    // Determine target
    stage = 'determining target';
    if (args.length === 1) {
      if (recipe.github?.name) {
        target = recipe.github.name;
      } else {
        throw new Error('No target provided and recipe.github.name missing');
      }
    }
    if (!recipe.github?.owner || !recipe.github?.visibility) {
      throw new Error('Recipe must include github.owner and github.visibility');
    }

    // Check GH CLI auth
    stage = 'checking GH CLI auth';
    try {
      await $`gh auth status`;
    } catch {
      console.log('Not authenticated; running gh auth login');
      await $`gh auth login`;
    }

    // Inject secrets
    stage = 'injecting secrets';
    if (recipe.github.secrets) {
      for (const s of recipe.github.secrets) {
        const val = await getSecret(s.fromEnv);
        await $`gh secret set ${s.name} --body="${val}"`;
      }
    }

    // Create or clone repo
    stage = 'creating or cloning repo';
    const isLocal = target === '.' || fs.existsSync(target);
    let owner = recipe.github.owner;
    let repoName;
    if (isLocal) {
      const workdir = path.resolve(process.cwd(), target);
      fs.mkdirSync(workdir, { recursive: true });
      process.chdir(workdir);
      if (!fs.existsSync(path.join(workdir, '.git'))) {
        await $`git init`;
      }
      repoName = path.basename(workdir);
    } else {
      const tplArg = recipe.source?.repo ? `--template ${recipe.source.repo} ` : '';
      if (target.includes('/')) {
        [owner, repoName] = target.split('/', 2);
      } else {
        repoName = target;
      }
      repoName = repoName.trim()
      const visibilityArg = recipe.github.visibility || 'public';
      // name first, flags after
      console.log(`gh repo create ${owner}/${repoName} ${tplArg}--${visibilityArg}`)
      await $`gh repo create ${owner}/${repoName} ${tplArg}--${visibilityArg}`;
      await $`git clone https://github.com/${owner}/${repoName}.git`;
      process.chdir(repoName);
    }

    // Seed from source.dir
    stage = 'seeding from local directory';
    if (recipe.source?.dir) {
      const src = path.resolve(__dirname, '../', recipe.source.dir);
      await $`cp -R ${src}/. .`;
      await $`git add . && git commit -m "chore: seed from ${recipe.source.dir}"`;
      if (!isLocal) await $`git push origin ${recipe.github.branches.default}`;
    }

    // Create and push integration branch
    stage = 'creating integration branch';
    const mainBranch = recipe.github.branches.default;
    const devBranch  = recipe.github.branches.integration;
    await $`git checkout -b ${devBranch}`;
    if (!isLocal) await $`git push -u origin ${devBranch}`;

    // Apply branch protection
    stage = 'applying branch protection';
    if (recipe.github.protection) {
      const p = recipe.github.protection;
      for (const branch of [devBranch, mainBranch]) {
        const approvals = p.approvals?.[branch] || 0;
        await $`gh api repos/${owner}/${repoName}/branches/${branch}/protection \
          -f required_status_checks.strict=${p.strict} \
          -f required_status_checks.contexts='${JSON.stringify(p.contexts)}' \
          -f required_pull_request_reviews.dismiss_stale_reviews=${p.dismissStaleReviews} \
          -f required_pull_request_reviews.required_approving_review_count=${approvals} \
          -f enforce_admins=${p.enforceAdmins}`;
      }
    }

    // Projen synthesis
    stage = 'running projen synthesis';
    if (recipe.project) {
      const opts = recipe.project;
      const rc = `
const { ${opts.type}, NodePackageManager } = require('projen');
const project = new ${opts.type}({
  defaultReleaseBranch: ${JSON.stringify(opts.defaultReleaseBranch)},
  packageManager: NodePackageManager.${opts.packageManager},
  deps: ${JSON.stringify(opts.deps, null, 2)},
  devDeps: ${JSON.stringify(opts.devDeps, null, 2)},
  eslint: ${opts.eslint},
  prettier: ${opts.prettier},
});
project.synth();
`;
      fs.writeFileSync('.projenrc.js', rc, 'utf8');
      await $`npx projen`;
      await $`git add . && git commit -m "chore: synth project via Projen"`;
      if (!isLocal) await $`git push`;
    }

    console.log(`Repository setup complete: ${owner}/${repoName}`);
  } catch (err) {
    console.error(`Error occurred at stage: ${stage}`);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
