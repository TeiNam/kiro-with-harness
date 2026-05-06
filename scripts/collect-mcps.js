#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const dirs = ['agents/cli/global', 'agents/cli/workspace'];
const mcps = {};

for (const dir of dirs) {
  const dirPath = path.join(__dirname, '..', dir);
  if (!fs.existsSync(dirPath)) continue;
  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));
  for (const f of files) {
    const agent = JSON.parse(fs.readFileSync(path.join(dirPath, f), 'utf8'));
    const servers = agent.mcpServers || {};
    for (const [name, cfg] of Object.entries(servers)) {
      if (!mcps[name]) {
        mcps[name] = { ...cfg, usedBy: [] };
      }
      mcps[name].usedBy.push(agent.name);
    }
  }
}

console.log(JSON.stringify(mcps, null, 2));
