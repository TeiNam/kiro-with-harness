#!/usr/bin/env node
// 에이전트 정의를 Kiro CLI V3 / IDE 1.0 에이전트 스키마로 검증한다.
// 기준: https://kiro.dev/docs/custom-agents/configuration-reference/
//       https://kiro.dev/docs/permissions/ · https://kiro.dev/docs/hooks/
//
// CLI 2.x 전용 필드(allowedTools/toolsSettings 등)가 남은 프로필은 V3 가 로드하지 않고
// 건너뛰거나(permissions 없음) 자동 업그레이드로 다시 쓰므로, 여기서 ERROR 로 막는다.

const fs = require('fs');
const path = require('path');

/** V3 에이전트 프로필 최상위 필드. */
const V3_FIELDS = new Set([
  'name',
  'description',
  'prompt',
  'model',
  'mcpServers',
  'tools',
  'excludedTools',
  'permissions',
  'resources',
  'hooks',
  'includeMcpJson',
  'includePowers',
  'welcomeMessage',
]);

/** CLI 2.x 전용 필드 → V3 대체. */
const V2_ONLY_FIELDS = {
  allowedTools: 'permissions.rules',
  toolsSettings: 'permissions.rules',
  toolAliases: 'full tool selectors',
  useLegacyMcpJson: 'includeMcpJson',
  keyboardShortcut: '(no V3 equivalent)',
  $schema: '(CLI 2.x agent-v1 schema URL)',
  kiroUpgrade: '(auto-upgrade marker; source files are V3-only)',
};

/** tools 에 쓸 수 있는 V3 카테고리 태그·소스 선택자·직접 도구 ID. */
const TOOL_TAGS = new Set(['*', '@builtin', '@mcp', '@powers', 'read', 'write', 'shell', 'web', 'subagent', 'spec', 'context', 'knowledge']);
const TOOL_IDS = new Set([
  'read_file', 'list_directory', 'file_search', 'grep_search',
  'fs_write', 'fs_append', 'str_replace', 'delete_file',
  'execute_bash', 'execute_pwsh', 'remote_web_search', 'web_fetch',
  'invoke_sub_agent', 'disclose_context', 'introspect', 'code', 'createHook',
]);
/** V3 에 없는 CLI 2.x 도구 이름 → V3 대체. */
const V2_ONLY_TOOLS = {
  fs_read: 'read', grep: 'read', glob: 'read', web_search: 'web', use_subagent: 'subagent', execute_cmd: 'shell',
  thinking: '(removed)', todo_list: '(removed)', todo: '(removed)', task: '(removed)', report_issue: '(removed)',
  use_aws: 'aws CLI or an AWS MCP server', aws: 'aws CLI or an AWS MCP server', delegate: 'subagent', session: '(removed)', tool_search: '(removed)', goal: '(removed)',
};

const CAPABILITIES = new Set([
  'fs_read', 'fs_write', 'shell', 'web_fetch', 'web_search', 'mcp', 'subagent', 'skill',
  'power', 'context', 'diagnostics', 'sandbox_network', 'all', 'builtin', 'filesystem',
]);
const EFFECTS = new Set(['allow', 'ask', 'deny', 'evaluate']);
const PRESETS = new Set(['allow-all', 'edit-workspace', 'read-workspace', 'read-all', 'read-only-shell', 'dev-shell', 'approve-for-me']);
/** match 없는 allow 가 괜찮은 읽기 계열. 그 외(shell·fs_write·mcp·subagent·all 등)는 범위가 있어야 한다. */
const UNSCOPED_ALLOW_OK = new Set(['fs_read', 'web_fetch', 'web_search', 'skill', 'context', 'diagnostics']);
/** 규칙 객체에 허용되는 키. 그 외(예: `exlcude` 오타)는 조용히 무효화되므로 ERROR. */
const RULE_KEYS = new Set(['capability', 'match', 'effect', 'exclude']);
/** shell·web·mcp 패턴은 glob(`*`)만 지원한다 — 미변환 정규식 흔적만 잡는다.
 *  `^ ( ) [ ] | ?` 는 명령·URL 에서 리터럴로 흔하므로(예: `git diff HEAD^`, `grep -E a|b`) 잡지 않고,
 *  선행 `^`·후행 `$`·`.*`·`**`·백슬래시 이스케이프만 정규식 흔적으로 본다. */
const NON_GLOB = /^\^|\$$|\S\.\*|\*\*|\\/;

const TRIGGERS = new Set([
  'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostFileCreate', 'PostFileSave',
  'PostFileDelete', 'PreTaskExec', 'PostTaskExec', 'Stop', 'SessionEnd',
]);

function isValidResourceUri(uri) {
  if (typeof uri !== 'string') return false;
  return /^(file:\/\/|skill:\/\/)/.test(uri);
}

function isValidTool(t) {
  if (typeof t !== 'string' || !t) return false;
  if (TOOL_TAGS.has(t) || TOOL_IDS.has(t)) return true;
  if (/^subagent\/[A-Za-z0-9._-]+$/.test(t)) return true;
  return /^@[A-Za-z0-9._-]+(\/[A-Za-z0-9._*-]+)?$/.test(t);
}

function validatePermissions(perm, issues) {
  if (typeof perm !== 'object' || perm === null || Array.isArray(perm)) {
    issues.push({ level: 'ERROR', msg: 'permissions must be an object { rules, policies? }' });
    return;
  }
  for (const key of Object.keys(perm)) {
    if (!['rules', 'policies'].includes(key)) issues.push({ level: 'ERROR', msg: `permissions: unknown field '${key}'` });
  }
  if (perm.rules !== undefined && !Array.isArray(perm.rules)) {
    issues.push({ level: 'ERROR', msg: 'permissions.rules must be an array' });
  }
  (Array.isArray(perm.rules) ? perm.rules : []).forEach((r, i) => {
    const at = `permissions.rules[${i}]`;
    if (!r || typeof r !== 'object' || Array.isArray(r)) {
      issues.push({ level: 'ERROR', msg: `${at}: rule must be an object { capability, match?, effect }` });
      return;
    }
    if (!CAPABILITIES.has(r.capability)) issues.push({ level: 'ERROR', msg: `${at}: unknown capability '${r.capability}'` });
    if (!EFFECTS.has(r.effect)) issues.push({ level: 'ERROR', msg: `${at}: invalid effect '${r.effect}' (allow|ask|deny|evaluate)` });
    for (const k of Object.keys(r)) {
      if (!RULE_KEYS.has(k)) issues.push({ level: 'ERROR', msg: `${at}: unknown rule key '${k}' (allowed: ${[...RULE_KEYS].join(', ')}) — a typo like 'exlcude' is silently ignored` });
    }
    // match 없는/바로 `*` 인 allow 는 그 capability 전체 허용이다 — 셸·쓰기·MCP·에이전트 시작에는 범위를 요구한다.
    const dangerousAllow = r.effect === 'allow' && CAPABILITIES.has(r.capability) && !UNSCOPED_ALLOW_OK.has(r.capability);
    if (dangerousAllow && r.match === undefined) {
      issues.push({ level: 'ERROR', msg: `${at}: unscoped '${r.capability}' allow grants the whole capability — add match patterns` });
    }
    if (dangerousAllow && Array.isArray(r.match) && r.match.includes('*')) {
      issues.push({ level: 'ERROR', msg: `${at}: '*' match grants the whole '${r.capability}' capability — scope it (e.g. 'git *', './**', 'server/*')` });
    }
    for (const key of ['match', 'exclude']) {
      if (r[key] === undefined) continue;
      if (!Array.isArray(r[key]) || r[key].length === 0 || r[key].some((p) => typeof p !== 'string' || !p)) {
        issues.push({ level: 'ERROR', msg: `${at}.${key} must be a non-empty array of non-empty strings` });
        continue;
      }
      if (['shell', 'web_fetch', 'web_search', 'mcp'].includes(r.capability)) {
        for (const p of r[key]) {
          if (NON_GLOB.test(p)) issues.push({ level: 'ERROR', msg: `${at}.${key}: '${p}' is not a V3 glob (regex anchors/.*/** are unsupported; use '*')` });
        }
      }
    }
  });
  if (perm.policies !== undefined) {
    if (!Array.isArray(perm.policies)) issues.push({ level: 'ERROR', msg: 'permissions.policies must be an array' });
    else for (const p of perm.policies) if (!PRESETS.has(p)) issues.push({ level: 'ERROR', msg: `permissions.policies: unknown preset '${p}'` });
  }
}

function validateHooks(hooks, issues) {
  if (!Array.isArray(hooks)) {
    issues.push({ level: 'ERROR', msg: 'hooks must be an array (V3 inline form); camelCase object hooks are CLI 2.x' });
    return;
  }
  hooks.forEach((h, i) => {
    const at = `hooks[${i}]`;
    if (!h || typeof h.name !== 'string' || !h.name) issues.push({ level: 'ERROR', msg: `${at}: name is required` });
    if (!TRIGGERS.has(h && h.trigger)) issues.push({ level: 'ERROR', msg: `${at}: trigger '${h && h.trigger}' must be a PascalCase V3 trigger` });
    const a = h && h.action;
    if (!a || !['command', 'agent'].includes(a.type)) issues.push({ level: 'ERROR', msg: `${at}: action.type must be command|agent` });
    else if (a.type === 'command' && !a.command) issues.push({ level: 'ERROR', msg: `${at}: action.command is required` });
    else if (a.type === 'agent' && !a.prompt) issues.push({ level: 'ERROR', msg: `${at}: action.prompt is required` });
    if (h && h.timeout !== undefined && !(Number.isFinite(h.timeout) && h.timeout >= 0)) {
      issues.push({ level: 'ERROR', msg: `${at}: timeout must be a non-negative number of seconds` });
    }
  });
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
  if (!agent || typeof agent !== 'object' || Array.isArray(agent)) {
    return [{ level: 'ERROR', msg: 'agent profile must be a JSON object' }];
  }

  // 1. 최상위 필드: V2 전용은 대체를 안내하고, 그 외 미지 필드는 오류.
  for (const key of Object.keys(agent)) {
    if (Object.prototype.hasOwnProperty.call(V2_ONLY_FIELDS, key)) {
      issues.push({ level: 'ERROR', msg: `CLI 2.x field '${key}' is not part of the V3 schema → ${V2_ONLY_FIELDS[key]}` });
    } else if (!V3_FIELDS.has(key)) {
      issues.push({ level: 'ERROR', msg: `Unknown top-level field: '${key}'` });
    }
  }

  // 2. name 은 필수이며 파일명과 같아야 한다. 문자열 필드는 타입까지 본다.
  if (!agent.name) {
    issues.push({ level: 'ERROR', msg: 'Missing required field: name' });
  } else if (agent.name !== path.basename(filePath, '.json')) {
    issues.push({ level: 'WARN', msg: `name('${agent.name}') != filename('${path.basename(filePath, '.json')}')` });
  }
  if (!agent.model) issues.push({ level: 'WARN', msg: 'missing field: model' });
  for (const key of ['name', 'description', 'prompt', 'model']) {
    if (agent[key] !== undefined && typeof agent[key] !== 'string') issues.push({ level: 'ERROR', msg: `${key} must be a string` });
  }

  // 3. tools: V3 태그·선택자·도구 ID 만.
  if (!Array.isArray(agent.tools) || agent.tools.length === 0) {
    issues.push({ level: 'ERROR', msg: 'tools must be a non-empty array of V3 selectors' });
  } else {
    for (const t of agent.tools) {
      if (Object.prototype.hasOwnProperty.call(V2_ONLY_TOOLS, t)) {
        issues.push({ level: 'ERROR', msg: `tools: '${t}' is a CLI 2.x tool → ${V2_ONLY_TOOLS[t]}` });
      } else if (!isValidTool(t)) {
        issues.push({ level: 'ERROR', msg: `tools: invalid selector '${t}'` });
      }
    }
    // @server 선택자는 같은 파일의 mcpServers 정의가 있어야 한다(includeMcpJson 이 아니면).
    const servers = new Set(Object.keys(agent.mcpServers || {}));
    for (const t of agent.tools) {
      const m = /^@([^/]+)/.exec(t);
      if (m && !['builtin', 'mcp', 'powers'].includes(m[1]) && !servers.has(m[1]) && agent.includeMcpJson !== true) {
        issues.push({ level: 'WARN', msg: `tools: '${t}' has no matching mcpServers.${m[1]}` });
      }
    }
  }

  // 4. permissions / hooks
  if (agent.permissions !== undefined) validatePermissions(agent.permissions, issues);
  if (agent.hooks !== undefined) validateHooks(agent.hooks, issues);

  // 5. resources URI
  if (agent.resources !== undefined && !Array.isArray(agent.resources)) {
    issues.push({ level: 'ERROR', msg: 'resources must be an array' });
  }
  (Array.isArray(agent.resources) ? agent.resources : []).forEach((r, i) => {
    if (typeof r === 'object' && r !== null) {
      if (r.type !== 'knowledgeBase') issues.push({ level: 'WARN', msg: `resources[${i}]: unknown object type '${r.type}'` });
    } else if (!isValidResourceUri(r)) {
      issues.push({ level: 'ERROR', msg: `resources[${i}]: invalid URI '${r}'` });
    } else if (r.startsWith('file://Users/') || r.startsWith('file://home/')) {
      issues.push({ level: 'ERROR', msg: `resources[${i}]: absolute paths must use 'file:///' (got '${r}')` });
    }
  });

  // 6. mcpServers 구조
  if (agent.mcpServers && typeof agent.mcpServers === 'object') {
    for (const [name, cfg] of Object.entries(agent.mcpServers)) {
      if (!cfg || (!cfg.command && !cfg.url)) {
        issues.push({ level: 'ERROR', msg: `mcpServers.${name}: command or url is required` });
      }
    }
  }

  // 7. 불리언 필드 타입
  for (const key of ['includeMcpJson', 'includePowers']) {
    if (agent[key] !== undefined && typeof agent[key] !== 'boolean') issues.push({ level: 'ERROR', msg: `${key} must be a boolean` });
  }

  return issues;
}

const IDE_TOOL_TAGS = new Set(['read', 'write', 'shell', 'web', 'subagent', 'context', '@mcp', '@builtin', '*']);

/** IDE 에이전트(.md) frontmatter 최소 파서 — name/model/tools 등 단순 `key: value`. */
function parseFrontmatter(raw) {
  if (!raw.startsWith('---')) return null;
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return null;
  const obj = {};
  for (const line of raw.slice(3, end).split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_]+)\s*:\s*(.*)$/);
    if (m) obj[m[1]] = m[2].trim();
  }
  return obj;
}

/**
 * IDE 에이전트(.md) 검증 — IDE 1.0 custom agent 규격.
 * tag-based tools 를 필수로 요구하고, 태그가 허용 집합(read/write/shell/web/
 * subagent/context/@mcp/@builtin/*) 에 속하는지 확인한다.
 */
function validateIdeAgent(filePath) {
  const issues = [];
  const fm = parseFrontmatter(fs.readFileSync(filePath, 'utf8'));
  if (!fm) return [{ level: 'ERROR', msg: 'missing YAML frontmatter' }];
  const base = path.basename(filePath, '.md');
  if (!fm.name) issues.push({ level: 'ERROR', msg: 'missing required field: name' });
  else if (fm.name !== base) issues.push({ level: 'WARN', msg: `name('${fm.name}') != filename('${base}')` });
  if (!fm.model) issues.push({ level: 'WARN', msg: 'missing field: model' });
  if (!fm.tools) {
    issues.push({ level: 'ERROR', msg: 'missing tools (IDE 1.0 tag-based tools required)' });
  } else {
    const tags = fm.tools.replace(/^\[|\]$/g, '').split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    if (tags.length === 0) issues.push({ level: 'ERROR', msg: 'tools is empty' });
    for (const t of tags) {
      if (!IDE_TOOL_TAGS.has(t)) {
        issues.push({ level: 'ERROR', msg: `invalid tool tag '${t}' (allowed: ${[...IDE_TOOL_TAGS].join(', ')})` });
      }
    }
  }
  return issues;
}

function main() {
  let totalErrors = 0;
  let totalWarns = 0;
  let filesWithIssues = 0;
  const groups = [
    { dirs: ['agents/cli/global', 'agents/cli/workspace'], ext: '.json', fn: validateAgent },
    { dirs: ['agents/ide'], ext: '.md', fn: validateIdeAgent },
  ];

  for (const grp of groups) {
    for (const dir of grp.dirs) {
      const dirPath = path.join(__dirname, '..', dir);
      if (!fs.existsSync(dirPath)) continue;

      const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(grp.ext));
      console.log(`\n=== ${dir} (${files.length} files) ===`);

      for (const f of files) {
        const filePath = path.join(dirPath, f);
        const issues = grp.fn(filePath);
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
  }

  console.log('\n=== Summary ===');
  console.log(`Files with issues: ${filesWithIssues}`);
  console.log(`ERROR: ${totalErrors}`);
  console.log(`WARN:  ${totalWarns}`);
  process.exitCode = totalErrors > 0 ? 1 : 0;
}

if (require.main === module) main();

module.exports = { validateAgent, validateIdeAgent, isValidTool, NON_GLOB };
