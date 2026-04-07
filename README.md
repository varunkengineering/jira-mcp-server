# Jira MCP Server

[![MCP](https://badge.mcpx.dev/default)](https://modelcontextprotocol.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A production-ready [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for Jira integration. Interact with Jira using natural language through any MCP-compatible client — create issues, search with JQL, manage workflows, generate reports, and more.

## Features

- **Dual Transport** — Works as a local stdio process or a remote HTTP server
- **Full Jira CRUD** — Create, read, update, search, transition, comment, and attach files
- **Bulk Operations** — Create multiple issues in a single call
- **JQL Search** — Full JQL support for advanced queries
- **Excel Reports** — Generate `.xlsx` reports from Jira data
- **Kubernetes Ready** — Includes Helm chart, Dockerfile, and CI/CD pipeline
- **Security Scanning** — Optional Trivy image scanning in CI pipeline

## Architecture

```
┌──────────────────┐                    ┌─────────────────────────────────┐
│  MCP Client       │   stdio / HTTP    │  Jira MCP Server                │
│  (Kiro, Cursor,   │ ◄──────────────► │  (Node.js + TypeScript)         │
│   Claude, etc.)   │                   │                                 │
└──────────────────┘                   │  ┌───────────────────────────┐  │
                                       │  │ MCP Protocol Handler      │  │
                                       │  │ (stdio or Streamable HTTP)│  │
                                       │  └─────────┬─────────────────┘  │
                                       │            │                     │
                                       │  ┌─────────▼─────────────────┐  │
                                       │  │ Jira REST API v3 Client   │  │
                                       │  └───────────────────────────┘  │
                                       └─────────────────────────────────┘
```

## Available Tools

| Tool | Description |
|------|-------------|
| `get_projects` | List all Jira projects |
| `get_issues` | Get project issues with optional JQL filtering |
| `create_issues_bulk` | Create multiple issues at once |
| `jira_get_issue` | Get details of a specific issue |
| `jira_search` | Search issues using JQL |
| `jira_update_issue` | Update an existing issue |
| `jira_transition_issue` | Transition an issue to a new status |
| `jira_add_comment` | Add a comment to an issue |
| `jira_add_attachment` | Attach a file to an issue |
| `generate_excel` | Generate an Excel (.xlsx) report |

## Quick Start

### 1. Clone and Build

```bash
git clone https://github.com/varunkengineering/mcp-projects.git
cd mcp-projects
npm install
npm run build
```

### 2. Configure Environment

Create a `.env` file:

```bash
JIRA_HOST=your-instance.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=your-api-token
```

Get your API token from: https://id.atlassian.com/manage-profile/security/api-tokens

### 3. Run

```bash
# stdio mode (for local MCP clients)
npm start

# HTTP mode (for remote/Kubernetes deployment)
TRANSPORT=http PORT=3000 npm start
```

## Client Setup

<details>
<summary><b>VS Code + Copilot</b></summary>

Press `Ctrl+Shift+P` → **MCP: Add Server**, then add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "jira-server": {
      "command": "node",
      "args": ["${workspaceFolder}/build/index.js"],
      "cwd": "${workspaceFolder}",
      "env": {
        "JIRA_HOST": "your-instance.atlassian.net",
        "JIRA_EMAIL": "your-email@example.com",
        "JIRA_API_TOKEN": "your-api-token"
      },
      "type": "stdio"
    }
  }
}
```
</details>

<details>
<summary><b>Claude Desktop</b></summary>

Edit your Claude Desktop config:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "jira-server": {
      "command": "node",
      "args": ["/path/to/jira-mcp-server/build/index.js"],
      "cwd": "/path/to/jira-mcp-server",
      "env": {
        "JIRA_HOST": "your-instance.atlassian.net",
        "JIRA_EMAIL": "your-email@example.com",
        "JIRA_API_TOKEN": "your-api-token"
      }
    }
  }
}
```
</details>

<details>
<summary><b>Cursor</b></summary>

Add to `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global):

```json
{
  "mcpServers": {
    "jira-server": {
      "command": "node",
      "args": ["/path/to/jira-mcp-server/build/index.js"],
      "cwd": "/path/to/jira-mcp-server",
      "env": {
        "JIRA_HOST": "your-instance.atlassian.net",
        "JIRA_EMAIL": "your-email@example.com",
        "JIRA_API_TOKEN": "your-api-token"
      }
    }
  }
}
```
</details>

<details>
<summary><b>Kiro CLI</b></summary>

```bash
kiro-cli mcp add \
  --name jira-server \
  --command "node" \
  --args "/path/to/jira-mcp-server/build/index.js" \
  --env "JIRA_HOST=your-instance.atlassian.net,JIRA_EMAIL=your-email@example.com,JIRA_API_TOKEN=your-api-token" \
  --scope global
```

Or for a remote HTTP deployment:

```bash
kiro-cli mcp add \
  --name jira-server \
  --url "https://your-domain.com/jira-mcp/mcp" \
  --scope global
```
</details>

<details>
<summary><b>Cline</b></summary>

Add to `cline_mcp_settings.json`:

```json
{
  "mcpServers": {
    "jira-server": {
      "command": "node",
      "args": ["/path/to/jira-mcp-server/build/index.js"],
      "cwd": "/path/to/jira-mcp-server",
      "env": {
        "JIRA_HOST": "your-instance.atlassian.net",
        "JIRA_EMAIL": "your-email@example.com",
        "JIRA_API_TOKEN": "your-api-token"
      },
      "type": "stdio",
      "timeout": 60
    }
  }
}
```
</details>

<details>
<summary><b>Windsurf</b></summary>

Add to your Windsurf MCP settings:

```json
{
  "mcpServers": {
    "jira-server": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/jira-mcp-server/build/index.js"],
      "cwd": "/path/to/jira-mcp-server",
      "env": {
        "JIRA_HOST": "your-instance.atlassian.net",
        "JIRA_EMAIL": "your-email@example.com",
        "JIRA_API_TOKEN": "your-api-token"
      },
      "timeout": 60
    }
  }
}
```
</details>

<details>
<summary><b>Amazon Q</b></summary>

Add as an MCP server in Amazon Q settings:
- **Name**: `jira-server`
- **Transport**: `stdio`
- **Command**: Path to your `node` executable
- **Arguments**: `/path/to/jira-mcp-server/build/index.js`
- **Environment Variables**: Set `JIRA_HOST`, `JIRA_EMAIL`, `JIRA_API_TOKEN`
</details>

## Usage Examples

Once connected, ask your AI assistant naturally:

```
"List all Jira projects"
"Show me open bugs in project MYAPP"
"Create a task: Setup CI/CD pipeline for backend service"
"Find all high-priority issues assigned to me"
"Move MYAPP-42 to In Progress"
"Add a comment on MYAPP-42: Fixed in latest commit"
"Generate an Excel report of all open issues in MYAPP"
```

## API Examples

### Get Issues with JQL

```typescript
{
  projectKey: "MYAPP",
  jql: "status = 'In Progress' AND assignee = currentUser()"
}
```

### Bulk Create Issues

```typescript
{
  issues: [
    {
      projectKey: "MYAPP",
      summary: "Setup monitoring",
      issueType: "Task",
      priority: "High",
      description: "Configure alerting and dashboards"
    },
    {
      projectKey: "MYAPP",
      summary: "Fix login timeout",
      issueType: "Bug",
      priority: "Critical"
    }
  ]
}
```

### Update Issue

```typescript
{
  issueKey: "MYAPP-123",
  summary: "Updated title",
  priority: "High",
  labels: ["backend", "urgent"]
}
```

## Kubernetes Deployment

The project includes a complete Helm chart for Kubernetes deployment. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for full details.

### Quick Deploy

```bash
# Create Jira credentials secret
kubectl create secret generic jira-mcp-credentials \
  --namespace your-namespace \
  --from-literal=JIRA_HOST="your-instance.atlassian.net" \
  --from-literal=JIRA_EMAIL="your-email@example.com" \
  --from-literal=JIRA_API_TOKEN="your-api-token"

# Deploy with Helm
helm upgrade --install jira-mcp-server deploy/ \
  --namespace your-namespace \
  --set image.repository="your-registry/jira-mcp-server" \
  --set image.tag="latest"
```

## CI/CD Pipeline

See [docs/PIPELINE.md](docs/PIPELINE.md) for the full CI/CD pipeline documentation.

The included pipeline supports:
1. **Build** — Docker image build
2. **Security Scan** — Trivy vulnerability scanning (optional)
3. **Push** — Push to container registry
4. **Deploy** — Helm deploy to Kubernetes
5. **Notify** — Webhook notification on success/failure

## Project Structure

```
jira-mcp-server/
├── src/
│   └── index.ts              # MCP server (stdio + HTTP transport)
├── deploy/                   # Helm chart
│   ├── Chart.yaml
│   ├── values.yaml
│   └── templates/
│       ├── deployment.yaml
│       ├── service.yaml
│       ├── ingress.yaml
│       ├── serviceaccount.yaml
│       └── hpa.yaml
├── docs/
│   ├── DEPLOYMENT.md         # Kubernetes deployment guide
│   └── PIPELINE.md           # CI/CD pipeline documentation
├── Dockerfile
├── bitbucket-pipelines.yml   # CI/CD pipeline
├── package.json
├── tsconfig.json
└── smithery.yaml             # Smithery.ai configuration
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `JIRA_HOST` | Jira instance hostname (e.g., `your-instance.atlassian.net`) | Yes |
| `JIRA_EMAIL` | Jira account email | Yes |
| `JIRA_API_TOKEN` | API token from Atlassian | Yes |
| `TRANSPORT` | `stdio` (default) or `http` | No |
| `PORT` | HTTP port (default: `3000`) | No |

## References

- [Model Context Protocol](https://modelcontextprotocol.io)
- [Jira REST API v3 Documentation](https://developer.atlassian.com/cloud/jira/platform/rest/v3/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)

## License

MIT
