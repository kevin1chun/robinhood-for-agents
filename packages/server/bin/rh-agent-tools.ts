#!/usr/bin/env bun
export {};

const args = process.argv.slice(2);

if (args[0] === "onboard" || args[0] === "setup") {
  const { onboard } = await import("../src/cli/onboard.js");
  const agentFlag = args.find((a) => a.startsWith("--agent=") || a.startsWith("--agent "));
  let preselected: "claude-code" | "openclaw" | "codex" | undefined;

  const agentIdx = args.indexOf("--agent");
  if (agentIdx !== -1 && args[agentIdx + 1]) {
    const val = args[agentIdx + 1];
    if (val === "claude-code" || val === "openclaw" || val === "codex") {
      preselected = val;
    }
  } else if (agentFlag?.startsWith("--agent=")) {
    const val = agentFlag.split("=")[1];
    if (val === "claude-code" || val === "openclaw" || val === "codex") {
      preselected = val;
    }
  }

  await onboard(preselected);
} else if (args[0] === "install") {
  const skillsOnly = args.includes("--skills");
  const mcpOnly = args.includes("--mcp");
  const both = !skillsOnly && !mcpOnly;

  console.log("rh-agent-tools install\n");

  if (both || mcpOnly) {
    const { installMcp } = await import("../src/cli/install-mcp.js");
    installMcp();
  }

  if (both || skillsOnly) {
    const { installSkills } = await import("../src/cli/install-skills.js");
    installSkills(process.cwd());
  }

  if (both) {
    console.log("\nRestart Claude Code to pick up the changes.");
  }
} else if (args.includes("--help") || args.includes("-h")) {
  console.log(`rh-agent-tools — AI-native Robinhood trading interface

Usage:
  rh-agent-tools                  Start the MCP server (stdio transport)
  rh-agent-tools onboard          Interactive setup TUI (all agents)
  rh-agent-tools onboard --agent claude-code|openclaw|codex
  rh-agent-tools install          Install MCP server config + skills (Claude Code)
  rh-agent-tools install --mcp    Install MCP server config only
  rh-agent-tools install --skills Install Claude Code skills only
  rh-agent-tools --help           Show this help message`);
} else {
  const { main } = await import("../src/index.js");
  await main();
}
