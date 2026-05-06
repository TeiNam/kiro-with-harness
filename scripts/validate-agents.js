#!/usr/bin/env node
// Validate agent JSON files against the official Kiro CLI schema.
// Schema: https://raw.githubusercontent.com/aws/amazon-q-developer-cli/refs/heads/main/schemas/agent-v1.json

const fs = require('fs');
const path = require('path');

const ALLOWED_TOP_LEVEL = new Set([
  '$schema',
  'name',
  'description',
  'prompt',
  'mcpServers',
  'tools',
  'toolAliases',
  'allowedTools',
  'resources',
  'hooks',
  'toolsSettings',
  'useLegacyMcpJson',
  'includeMcpJson',
  'model',
  'keyboardShortcut',
  'welcomeMessage',
]);

function isValidResourceUri(uri) {
  if (typeof uri !== 'string') return false;
  return /^(file:\/\/|skill:\/\/)/.test(uri);
}

function validateAgent(filePath) {
  const issues = [];
  const raw = fs.readFileSync(filePath, 'utf8');
  let agent;
  try {
    agent = JSON.parse(raw);
  } catch (e) {
    return [{ level: 'ERROR', msg: `JSON parse failed: ${e.message}` }];
  }

  // 1. Top-level field check (no fields outside the schema)
  for (const key of Object.keys(agent)) {
    if (!ALLOWED_TOP_LEVEL.has(key)) {
      issues.push({
        level: 'ERROR',
        msg: `Unknown top-level field: '${key}'`,
      });
    }
  }

  // 2. name is required and must match the filename
  if (!agent.name) {
    issues.push({ level: 'ERROR', msg: 'Missing required field: name' });
  } else if (agent.name !== path.basename(filePath, '.json')) {
    issues.push({
      level: 'WARN',
      msg: `name('${agent.name}') != filename('${path.basename(filePath, '.json')}')`,
    });
  }

  // 3. Validate resources URIs
  if (Array.isArray(agent.resources)) {
    agent.resources.forEach((r, i) => {
      if (typeof r === 'object' && r !== null) {
        if (r.type !== 'knowledgeBase') {
          issues.push({
            level: 'WARN',
            msg: `resources[${i}]: unknown object type '${r.type}'`,
          });
        }
      } else if (!isValidResourceUri(r)) {
        issues.push({
          level: 'ERROR',
          msg: `resources[${i}]: invalid URI '${r}'`,
        });
      } else if (r.startsWith('file://Users/') || r.startsWith('file://home/')) {
        issues.push({
          level: 'ERROR',
          msg: `resources[${i}]: absolute paths must use 'file:///' (got '${r}')`,
        });
      }
    });
  }

  // 4. Detect legacy tool names in toolsSettings
  if (agent.toolsSettings && typeof agent.toolsSettings === 'object') {
    for (const toolName of Object.keys(agent.toolsSettings)) {
      if (toolName === 'crew') {
        issues.push({
          level: 'ERROR',
          msg: `toolsSettings.crew must be renamed to 'subagent'`,
        });
      }
    }
  }

  // 5. Validate subagent settings
  const sub = agent.toolsSettings?.subagent;
  if (sub) {
    if (sub.availableAgents && !Array.isArray(sub.availableAgents)) {
      issues.push({ level: 'ERROR', msg: 'subagent.availableAgents must be an array' });
    }
    if (sub.trustedAgents && !Array.isArray(sub.trustedAgents)) {
      issues.push({ level: 'ERROR', msg: 'subagent.trustedAgents must be an array' });
    }
    const tools = agent.tools || [];
    const hasSubagent =
      tools.includes('subagent') || tools.includes('*') || tools.includes('@builtin');
    if (!hasSubagent) {
      issues.push({
        level: 'WARN',
        msg: `subagent settings present but 'subagent' is missing from tools`,
      });
    }
  }

  // 6. Validate mcpServers structure
  if (agent.mcpServers && typeof agent.mcpServers === 'object') {
    for (const [name, cfg] of Object.entries(agent.mcpServers)) {
      if (!cfg.command && !cfg.url) {
        issues.push({
          level: 'ERROR',
          msg: `mcpServers.${name}: command or url is required`,
        });
      }
    }
  }

  // 7. Disallow '*' wildcard in allowedTools
  if (Array.isArray(agent.allowedTools)) {
    agent.allowedTools.forEach((t, i) => {
      if (t === '*') {
        issues.push({
          level: 'ERROR',
          msg: `allowedTools[${i}]: '*' wildcard is not allowed`,
        });
      }
    });
  }

  return issues;
}

function main() {
  const dirs = ['agents/cli/global', 'agents/cli/workspace'];
  let totalErrors = 0;
  let totalWarns = 0;
  let filesWithIssues = 0;

  for (const dir of dirs) {
    const dirPath = path.join(__dirname, '..', dir);
    if (!fs.existsSync(dirPath)) continue;

    const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.json'));
    console.log(`\n=== ${dir} (${files.length} files) ===`);

    for (const f of files) {
      const filePath = path.join(dirPath, f);
      const issues = validateAgent(filePath);
      const errors = issues.filter((i) => i.level === 'ERROR');
      const warns = issues.filter((i) => i.level === 'WARN');

      if (issues.length === 0) {
        console.log(`  ✅ ${f}`);
      } else {
        filesWithIssues++;
        totalErrors += errors.length;
        totalWarns += warns.length;
        const icon = errors.length > 0 ? '❌' : '⚠️ ';
        console.log(`  ${icon} ${f}`);
        for (const issue of issues) {
          console.log(`     [${issue.level}] ${issue.msg}`);
        }
      }
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Files with issues: ${filesWithIssues}`);
  console.log(`ERROR: ${totalErrors}`);
  console.log(`WARN:  ${totalWarns}`);
}

main();
