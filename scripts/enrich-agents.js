#!/usr/bin/env node
// Enrich each agent JSON file with category-appropriate configuration.
// - Preserves existing name, description, and prompt
// - Fills in Kiro-compatible fields: tools, allowedTools, resources, toolsSettings, ...

const fs = require('fs');
const path = require('path');

const AGENTS_DIR = path.join(__dirname, '..', 'agents');

// Agent category assignment
const CATEGORIES = {
  reviewer: [
    'code-reviewer',
    'cpp-reviewer',
    'flutter-reviewer',
    'go-reviewer',
    'java-reviewer',
    'kotlin-reviewer',
    'python-reviewer',
    'rust-reviewer',
    'typescript-reviewer',
    'database-reviewer',
    'security-reviewer',
  ],
  buildResolver: [
    'build-error-resolver',
    'cpp-build-resolver',
    'go-build-resolver',
    'java-build-resolver',
    'kotlin-build-resolver',
    'pytorch-build-resolver',
    'rust-build-resolver',
  ],
  writer: ['article-writer', 'content-creator', 'doc-updater'],
  research: ['architect', 'planner', 'deep-researcher'],
  quality: ['tdd-guide', 'e2e-runner', 'refactor-cleaner'],
};

// Shared resources — steering auto-injects these, so agent-level resources stay empty
const COMMON_RESOURCES = [];

// Per-category configuration profiles
const PROFILES = {
  // Reviewer: read code + query git only. Writes require explicit authorization.
  reviewer: {
    tools: ['fs_read', 'execute_bash'],
    allowedTools: ['fs_read'],
    toolsSettings: {
      execute_bash: {
        allowedCommands: [
          'git diff',
          'git diff --staged',
          'git diff --cached',
          'git log --oneline -5',
          'git log --oneline -10',
          'git status',
          'git blame *',
          'git show *',
        ],
      },
    },
    resources: [...COMMON_RESOURCES],
  },

  // Build resolver: read + write + build execution
  buildResolver: {
    tools: ['fs_read', 'fs_write', 'execute_bash'],
    allowedTools: ['fs_read', 'fs_write'],
    toolsSettings: {
      execute_bash: {
        allowedCommands: [
          'git diff',
          'git status',
          'git log --oneline -5',
          'npm *',
          'pnpm *',
          'yarn *',
          'tsc *',
          'go build *',
          'go vet *',
          'go test *',
          'cargo build *',
          'cargo check *',
          'cargo test *',
          'cargo clippy *',
          'mvn *',
          'gradle *',
          './gradlew *',
          'cmake *',
          'make *',
          'ninja *',
          'python *',
          'pip *',
          'uv *',
        ],
        deniedCommands: [
          'rm -rf *',
          'sudo *',
          'git push *',
          'git reset --hard *',
          'git clean -f *',
        ],
      },
    },
    resources: [...COMMON_RESOURCES],
  },

  // Writer/docs: read + document write-focused
  writer: {
    tools: ['fs_read', 'fs_write'],
    allowedTools: ['fs_read', 'fs_write'],
    resources: [...COMMON_RESOURCES],
  },

  // Planning/research: read + exploration-focused. Limited write.
  research: {
    tools: ['fs_read', 'execute_bash'],
    allowedTools: ['fs_read'],
    toolsSettings: {
      execute_bash: {
        allowedCommands: [
          'git log *',
          'git diff *',
          'git status',
          'git show *',
          'ls *',
          'find *',
          'rg *',
        ],
      },
    },
    resources: [...COMMON_RESOURCES],
  },

  // Testing/quality: read + write + test execution
  quality: {
    tools: ['fs_read', 'fs_write', 'execute_bash'],
    allowedTools: ['fs_read', 'fs_write'],
    toolsSettings: {
      execute_bash: {
        allowedCommands: [
          'git diff',
          'git status',
          'npm test*',
          'npm run test*',
          'pnpm test*',
          'yarn test*',
          'pytest *',
          'go test *',
          'cargo test *',
          'mvn test*',
          'gradle test*',
          './gradlew test*',
          'jest *',
          'vitest *',
          'playwright *',
          'npx knip*',
          'npx depcheck*',
          'npx ts-prune*',
          'eslint *',
          'pylint *',
          'ruff *',
        ],
        deniedCommands: [
          'rm -rf *',
          'sudo *',
          'git push *',
          'git reset --hard *',
        ],
      },
    },
    resources: [...COMMON_RESOURCES],
  },
};

function getCategory(name) {
  for (const [cat, names] of Object.entries(CATEGORIES)) {
    if (names.includes(name)) return cat;
  }
  return null;
}

function enrichAgent(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const agent = JSON.parse(raw);
  const category = getCategory(agent.name);

  if (!category) {
    console.warn(`⚠️  ${agent.name}: no category, skipping`);
    return { name: agent.name, status: 'skipped' };
  }

  const profile = PROFILES[category];

  // Preserve: $schema, name, description, prompt
  // Merge/replace: tools, allowedTools, resources, toolsSettings
  const enriched = {
    $schema: agent.$schema,
    name: agent.name,
    description: agent.description,
    prompt: agent.prompt,
    mcpServers: agent.mcpServers || {},
    tools: profile.tools,
    toolAliases: agent.toolAliases || {},
    allowedTools: profile.allowedTools,
    resources: profile.resources,
    hooks: agent.hooks || {},
    toolsSettings: profile.toolsSettings || {},
    useLegacyMcpJson: agent.useLegacyMcpJson ?? false,
  };

  if (agent.model) enriched.model = agent.model;

  fs.writeFileSync(filePath, JSON.stringify(enriched, null, 2) + '\n', 'utf8');
  return { name: agent.name, category, status: 'updated' };
}

function main() {
  const files = fs
    .readdirSync(AGENTS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(AGENTS_DIR, f));

  const results = files.map(enrichAgent);
  const byStatus = results.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  console.log('\n=== Results ===');
  results
    .sort((a, b) => (a.category || '').localeCompare(b.category || ''))
    .forEach((r) => {
      const icon = r.status === 'updated' ? '✅' : '⚠️ ';
      console.log(`${icon} [${r.category || '?'}] ${r.name}`);
    });
  console.log('\nTotals:', byStatus);
}

main();
