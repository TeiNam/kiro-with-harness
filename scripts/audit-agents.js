#!/usr/bin/env node
// Audit agent command/MCP configuration against role expectations.

const fs = require('fs');
const path = require('path');

const ROLES = {
  orchestrator: ['kiro-cli'],
  reviewer: [
    'code-reviewer',
    'security-reviewer',
    'database-reviewer',
    'cpp-reviewer',
    'flutter-reviewer',
    'go-reviewer',
    'java-reviewer',
    'kotlin-reviewer',
    'python-reviewer',
    'rust-reviewer',
    'typescript-reviewer',
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
  writer: ['article-writer', 'content-creator', 'translator-docs'],
  research: ['architect', 'deep-researcher'],
  quality: ['e2e-runner', 'refactor-cleaner'],
  infra: ['devops'],
};

const EXPECTATIONS = {
  orchestrator: {
    mustHaveTools: ['subagent'],
    mustAllowTools: ['subagent'],
    expectMcp: false,
    notes: 'orchestrator',
  },
  reviewer: {
    mustHaveTools: ['fs_read', 'execute_bash'],
    mustNotHave: ['fs_write'],
    mustAllowTools: ['fs_read'],
    forbiddenAllowed: ['fs_write', 'execute_bash'],
    expectReadOnlyBash: true,
    bashMustInclude: ['git diff'],
    bashMustNotInclude: ['rm ', 'git push', 'git reset --hard'],
    expectMcp: false,
    notes: 'read-only reviewer',
  },
  buildResolver: {
    mustHaveTools: ['fs_read', 'fs_write', 'execute_bash'],
    mustAllowTools: ['fs_read', 'fs_write'],
    bashMustNotInclude: ['rm -rf', 'sudo ', 'git push', 'git reset --hard'],
    expectMcp: false,
    notes: 'build error resolver',
  },
  writer: {
    mustHaveTools: ['fs_read', 'fs_write'],
    mustAllowTools: ['fs_read', 'fs_write'],
    forbiddenAllowed: ['execute_bash'],
    expectMcp: false,
    notes: 'documentation writer',
  },
  research: {
    mustHaveTools: ['fs_read', 'execute_bash'],
    mustNotHave: ['fs_write'],
    forbiddenAllowed: ['fs_write'],
    expectReadOnlyBash: true,
    expectMcp: false,
    notes: 'research/investigation',
  },
  quality: {
    mustHaveTools: ['fs_read', 'fs_write', 'execute_bash'],
    bashMustNotInclude: ['rm -rf', 'sudo ', 'git push'],
    expectMcp: false,
    notes: 'testing/refactoring',
  },
  infra: {
    mustHaveTools: ['fs_read', 'execute_bash'],
    bashMustNotInclude: [
      'terraform apply -auto-approve',
      'terraform destroy -auto-approve',
      'kubectl delete namespace',
      'aws rds delete',
      'aws eks delete-cluster',
    ],
    expectMcp: true,
    notes: 'DevOps',
  },
};

function getRole(name) {
  for (const [role, names] of Object.entries(ROLES)) {
    if (names.includes(name)) return role;
  }
  return null;
}

function auditAgent(filePath) {
  const agent = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const role = getRole(agent.name);
  const issues = [];

  if (!role) {
    return { name: agent.name, role: '?', issues: [{ level: 'WARN', msg: 'Unknown role' }] };
  }

  const exp = EXPECTATIONS[role];
  const tools = agent.tools || [];
  const allowed = agent.allowedTools || [];
  const bash = agent.toolsSettings?.execute_bash || {};
  const allowedCmds = bash.allowedCommands || [];
  const mcp = agent.mcpServers || {};

  for (const t of exp.mustHaveTools || []) {
    if (!tools.includes(t) && !tools.includes('*') && !tools.includes('@builtin')) {
      issues.push({ level: 'ERROR', msg: `tools is missing '${t}'` });
    }
  }

  for (const t of exp.mustNotHave || []) {
    if (tools.includes(t)) {
      issues.push({ level: 'ERROR', msg: `tools must not include '${t}' for this role` });
    }
  }

  for (const t of exp.mustAllowTools || []) {
    if (!allowed.includes(t)) {
      issues.push({ level: 'WARN', msg: `allowedTools is missing '${t}' (will prompt on every use)` });
    }
  }

  for (const t of exp.forbiddenAllowed || []) {
    if (allowed.includes(t)) {
      issues.push({
        level: 'ERROR',
        msg: `allowedTools includes '${t}' (unsafe auto-approve)`,
      });
    }
  }

  if (exp.expectReadOnlyBash) {
    // Word-boundary match so we don't false-positive on terraform's 'rm', etc.
    const writePatterns = [
      /\brm\s/,
      /\bmv\s/,
      /\bcp\s/,
      /\bmkdir\s/,
      /\btouch\s/,
      /\bchmod\s/,
      /\bchown\s/,
      /\bgit commit\b/,
      /\bgit push\b/,
    ];
    for (const cmd of allowedCmds) {
      for (const pattern of writePatterns) {
        if (pattern.test(cmd)) {
          issues.push({
            level: 'WARN',
            msg: `read-only role but allowedCommands has a suspected write: '${cmd}'`,
          });
          break;
        }
      }
    }
  }

  for (const required of exp.bashMustInclude || []) {
    const hit = allowedCmds.some((c) => c.includes(required));
    if (!hit) {
      issues.push({ level: 'WARN', msg: `allowedCommands is missing pattern '${required}'` });
    }
  }

  for (const forbidden of exp.bashMustNotInclude || []) {
    const escaped = forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\8c33aeca-4f89-4813-b087-c76c7d99e903').replace(/\s+$/, '');
    const pattern = new RegExp(`\\b${escaped}(\\s|$)`);
    const bad = allowedCmds.some((c) => pattern.test(c));
    if (bad) {
      issues.push({
        level: 'ERROR',
        msg: `allowedCommands contains destructive command '${forbidden}'`,
      });
    }
  }

  const hasMcp = Object.keys(mcp).length > 0;
  if (exp.expectMcp && !hasMcp) {
    issues.push({ level: 'INFO', msg: `MCP recommended for this role (${exp.notes})` });
  }
  if (exp.expectMcp === false && hasMcp) {
    issues.push({
      level: 'INFO',
      msg: `MCP not expected for this role but configured: ${Object.keys(mcp).join(', ')}`,
    });
  }

  return { name: agent.name, role, issues };
}

function main() {
  const dirs = ['agents/cli/global', 'agents/cli/workspace'];
  const results = [];

  for (const dir of dirs) {
    const dirPath = path.join(__dirname, '..', dir);
    if (!fs.existsSync(dirPath)) continue;
    const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.json'));
    for (const f of files) {
      results.push({ dir, ...auditAgent(path.join(dirPath, f)) });
    }
  }

  const byRole = {};
  for (const r of results) {
    if (!byRole[r.role]) byRole[r.role] = [];
    byRole[r.role].push(r);
  }

  let totalErrors = 0;
  let totalWarns = 0;
  let totalInfos = 0;

  for (const role of Object.keys(byRole).sort()) {
    console.log(`\n=== [${role}] (${byRole[role].length} agents) ===`);
    for (const r of byRole[role]) {
      if (r.issues.length === 0) {
        console.log(`  ✅ ${r.name}`);
      } else {
        const errs = r.issues.filter((i) => i.level === 'ERROR').length;
        const warns = r.issues.filter((i) => i.level === 'WARN').length;
        const infos = r.issues.filter((i) => i.level === 'INFO').length;
        totalErrors += errs;
        totalWarns += warns;
        totalInfos += infos;
        const icon = errs > 0 ? '❌' : warns > 0 ? '⚠️ ' : 'ℹ️ ';
        console.log(`  ${icon} ${r.name}`);
        for (const issue of r.issues) {
          console.log(`     [${issue.level}] ${issue.msg}`);
        }
      }
    }
  }

  console.log('\n=== Summary ===');
  console.log(`ERROR: ${totalErrors}`);
  console.log(`WARN:  ${totalWarns}`);
  console.log(`INFO:  ${totalInfos}`);
}

main();
