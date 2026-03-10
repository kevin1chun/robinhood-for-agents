# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2025-03-10

### Added

- **MCP Server** with 18 structured tools for any MCP-compatible AI agent
- **Standalone client library** (`@rh-agent-tools/client`) with ~50 async methods
- **5 Claude Code skills**: setup, portfolio, research, trade, options
- Browser-based authentication via Playwright (Chrome)
- AES-256-GCM encrypted session storage with OS keychain key management
- Multi-account support (first-class across all account-scoped methods)
- Interactive onboarding TUI (`rh-agent-tools onboard`)
- One-command install for Claude Code (`rh-agent-tools install`)
- Safety controls: blocked fund transfers, blocked bulk cancels, explicit order parameters
- Support for Claude Code, Codex, and OpenClaw agents

[0.3.0]: https://github.com/kevin1chun/rh-agent-tools/releases/tag/v0.3.0
