#!/usr/bin/env node

import * as dotenv from 'dotenv';
dotenv.config();

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import JiraClient from "jira-client";
import type { Request } from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import * as path from "path";
import ExcelJS from "exceljs";

// Environment variables with validation
const JIRA_HOST = process.env.JIRA_HOST ?? "";
const JIRA_EMAIL = process.env.JIRA_EMAIL ?? "";
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN ?? "";

if (!JIRA_HOST || !JIRA_EMAIL || !JIRA_API_TOKEN) {
  throw new Error(
    "Missing required environment variables: JIRA_HOST, JIRA_EMAIL, and JIRA_API_TOKEN"
  );
}

interface GetIssuesArgs {
  projectKey: string;
  jql?: string;
}

interface CreateIssuesBulkArgs {
  issues: Array<{
    summary: string;
    issueType: string;
    projectKey: string;
    description?: string;
    assignee?: string;
    priority?: string;
    labels?: string[];
    components?: string[];
    parent?: string;
  }>;
}

interface GetIssueArgs {
  issueKey: string;
}

interface SearchIssuesArgs {
  jql: string;
  maxResults?: number;
}

interface UpdateIssueArgs {
  issueKey: string;
  summary?: string;
  description?: string;
  assignee?: string;
  priority?: string;
  labels?: string[];
  components?: string[];
}

interface TransitionIssueArgs {
  issueKey: string;
  transitionId: string;
  comment?: string;
}

interface AddCommentArgs {
  issueKey: string;
  comment: string;
}

interface AddAttachmentArgs {
  issueKey: string;
  filePath: string;
}

interface GenerateExcelArgs {
  fileName: string;
  sheetName?: string;
  columns: Array<{ header: string; key: string; width?: number }>;
  rows: Array<Record<string, string>>;
  outputDir?: string;
}

interface ToolDefinition {
  description: string;
  inputSchema: object;
}

class JiraServer {
  private readonly server: Server;
  private readonly jira: JiraClient;
  private readonly toolDefinitions: Record<string, ToolDefinition>;

  constructor() {
    this.toolDefinitions = {
      get_projects: {
        description: "List all Jira projects",
        inputSchema: { type: "object", properties: {}, additionalProperties: false }
      },
      get_issues: {
        description: "Get project issues with optional JQL filtering",
        inputSchema: {
          type: "object",
          properties: {
            projectKey: { type: "string" },
            jql: { type: "string" }
          },
          required: ["projectKey"]
        }
      },
      create_issues_bulk: {
        description: "Create multiple Jira issues at once",
        inputSchema: {
          type: "object",
          properties: {
            issues: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  summary: { type: "string" },
                  issueType: { type: "string" },
                  projectKey: { type: "string" },
                  description: { type: "string" },
                  assignee: { type: "string" },
                  priority: { type: "string" },
                  labels: { type: "array", items: { type: "string" } },
                  components: { type: "array", items: { type: "string" } },
                  parent: { type: "string" }
                },
                required: ["summary", "issueType", "projectKey"]
              }
            }
          },
          required: ["issues"]
        }
      },
      jira_get_issue: {
        description: "Get details of a specific issue",
        inputSchema: {
          type: "object",
          properties: { issueKey: { type: "string" } },
          required: ["issueKey"]
        }
      },
      jira_search: {
        description: "Search issues using JQL",
        inputSchema: {
          type: "object",
          properties: {
            jql: { type: "string" },
            maxResults: { type: "number" }
          },
          required: ["jql"]
        }
      },
      jira_update_issue: {
        description: "Update an existing issue",
        inputSchema: {
          type: "object",
          properties: {
            issueKey: { type: "string" },
            summary: { type: "string" },
            description: { type: "string" },
            assignee: { type: "string" },
            priority: { type: "string" },
            labels: { type: "array", items: { type: "string" } },
            components: { type: "array", items: { type: "string" } }
          },
          required: ["issueKey"]
        }
      },
      jira_transition_issue: {
        description: "Transition an issue to a new status",
        inputSchema: {
          type: "object",
          properties: {
            issueKey: { type: "string" },
            transitionId: { type: "string" },
            comment: { type: "string" }
          },
          required: ["issueKey", "transitionId"]
        }
      },
      jira_add_comment: {
        description: "Add a comment to an issue",
        inputSchema: {
          type: "object",
          properties: {
            issueKey: { type: "string" },
            comment: { type: "string" }
          },
          required: ["issueKey", "comment"]
        }
      },
      jira_add_attachment: {
        description: "Add a file attachment to a Jira issue",
        inputSchema: {
          type: "object",
          properties: {
            issueKey: { type: "string" },
            filePath: { type: "string" }
          },
          required: ["issueKey", "filePath"]
        }
      },
      generate_excel: {
        description: "Generate an Excel (.xlsx) file with custom columns and rows",
        inputSchema: {
          type: "object",
          properties: {
            fileName: { type: "string", description: "Name of the Excel file (without extension)" },
            sheetName: { type: "string", description: "Worksheet name (default: Sheet1)" },
            columns: {
              type: "array",
              items: {
                type: "object",
                properties: { header: { type: "string" }, key: { type: "string" }, width: { type: "number" } },
                required: ["header", "key"]
              }
            },
            rows: { type: "array", items: { type: "object" } },
            outputDir: { type: "string", description: "Output directory (default: cwd)" }
          },
          required: ["fileName", "columns", "rows"]
        }
      }
    };

    this.server = new Server(
      { name: "jira-server", version: "0.1.0" },
      { capabilities: { tools: this.toolDefinitions } }
    );

    this.jira = new JiraClient({
      protocol: "https",
      host: JIRA_HOST,
      username: JIRA_EMAIL,
      password: JIRA_API_TOKEN,
      apiVersion: "3",
      strictSSL: false,
    });

    this.setupToolHandlers();

    this.server.onerror = (error) => console.error("[MCP Error]", error);
    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private async jiraFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `https://${JIRA_HOST}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64')}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    return response.json();
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: Object.entries(this.toolDefinitions).map(([name, def]) => ({
        name,
        description: def.description,
        inputSchema: def.inputSchema
      })),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request: Request) => {
      try {
        if (!request.params?.name) {
          throw new McpError(ErrorCode.InvalidParams, "Tool name is required");
        }

        switch (request.params.name) {
          case "get_projects": {
            const projects = await this.jira.listProjects();
            return {
              content: [{ type: "text", text: JSON.stringify(projects.map(p => ({ key: p.key, name: p.name }))) }]
            };
          }

          case "get_issues": {
            const args = request.params.arguments as GetIssuesArgs;
            if (!args?.projectKey) throw new McpError(ErrorCode.InvalidParams, "projectKey is required");

            const jql = `project = ${args.projectKey}${args.jql ? ` AND ${args.jql}` : ''}`;
            const result = await this.jiraFetch('/rest/api/3/search/jql', {
              method: 'POST',
              body: JSON.stringify({ jql, maxResults: 100, fields: ["summary", "status", "assignee", "priority", "issuetype", "created", "updated", "description", "reporter", "duedate"] })
            });
            return { content: [{ type: "text", text: JSON.stringify(result.issues || result) }] };
          }

          case "create_issues_bulk": {
            const bulkArgs = request.params.arguments as CreateIssuesBulkArgs;
            if (!bulkArgs?.issues || !Array.isArray(bulkArgs.issues)) {
              throw new McpError(ErrorCode.InvalidParams, "issues array is required");
            }

            const results = await Promise.all(
              bulkArgs.issues.map(async (issue) => {
                try {
                  const issueData: any = {
                    fields: {
                      project: { key: issue.projectKey },
                      summary: issue.summary,
                      issuetype: { name: issue.issueType },
                      description: {
                        type: "doc", version: 1,
                        content: [{ type: "paragraph", content: [{ type: "text", text: issue.description || "" }] }]
                      }
                    }
                  };

                  if (issue.assignee) issueData.fields.assignee = { accountId: issue.assignee };
                  if (issue.priority) issueData.fields.priority = { name: issue.priority };
                  if (issue.labels?.length) issueData.fields.labels = issue.labels;
                  if (issue.components?.length) issueData.fields.components = issue.components.map(c => ({ name: c }));
                  if (issue.parent) issueData.fields.parent = { key: issue.parent };

                  const created = await this.jira.addNewIssue(issueData);
                  return { success: true, issue: { key: created.key, id: created.id, summary: issue.summary } };
                } catch (error) {
                  return { success: false, error: error instanceof Error ? error.message : 'Unknown error', summary: issue.summary };
                }
              })
            );

            return { content: [{ type: "text", text: JSON.stringify({ message: "Bulk issue creation completed", results }, null, 2) }] };
          }

          case "jira_get_issue": {
            const args = request.params.arguments as GetIssueArgs;
            if (!args?.issueKey) throw new McpError(ErrorCode.InvalidParams, "issueKey is required");
            const issue = await this.jira.findIssue(args.issueKey);
            return { content: [{ type: "text", text: JSON.stringify(issue, null, 2) }] };
          }

          case "jira_search": {
            const args = request.params.arguments as SearchIssuesArgs;
            if (!args?.jql) throw new McpError(ErrorCode.InvalidParams, "jql is required");
            const results = await this.jiraFetch('/rest/api/3/search/jql', {
              method: 'POST',
              body: JSON.stringify({ jql: args.jql, maxResults: args.maxResults || 50, fields: ["summary", "status", "assignee", "priority", "issuetype", "created", "updated", "labels", "components", "description", "reporter", "duedate"] })
            });
            return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
          }

          case "jira_update_issue": {
            const args = request.params.arguments as UpdateIssueArgs;
            if (!args?.issueKey) throw new McpError(ErrorCode.InvalidParams, "issueKey is required");

            const updateData: any = { fields: {} };
            if (args.summary) updateData.fields.summary = args.summary;
            if (args.description) {
              updateData.fields.description = {
                type: "doc", version: 1,
                content: [{ type: "paragraph", content: [{ type: "text", text: args.description }] }]
              };
            }
            if (args.assignee) updateData.fields.assignee = { accountId: args.assignee };
            if (args.priority) updateData.fields.priority = { name: args.priority };
            if (args.labels) updateData.fields.labels = args.labels;
            if (args.components) updateData.fields.components = args.components.map(c => ({ name: c }));

            await this.jira.updateIssue(args.issueKey, updateData);
            return { content: [{ type: "text", text: JSON.stringify({ message: "Issue updated successfully", issueKey: args.issueKey }) }] };
          }

          case "jira_transition_issue": {
            const args = request.params.arguments as TransitionIssueArgs;
            if (!args?.issueKey || !args?.transitionId) throw new McpError(ErrorCode.InvalidParams, "issueKey and transitionId are required");

            const transitionData: any = { transition: { id: args.transitionId } };
            if (args.comment) {
              transitionData.update = {
                comment: [{ add: { body: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: args.comment }] }] } } }]
              };
            }

            await this.jira.transitionIssue(args.issueKey, transitionData);
            return { content: [{ type: "text", text: JSON.stringify({ message: "Issue transitioned successfully", issueKey: args.issueKey, transitionId: args.transitionId }) }] };
          }

          case "jira_add_comment": {
            const args = request.params.arguments as AddCommentArgs;
            if (!args?.issueKey || !args?.comment) throw new McpError(ErrorCode.InvalidParams, "issueKey and comment are required");
            const added = await this.jira.addComment(args.issueKey, args.comment);
            return { content: [{ type: "text", text: JSON.stringify({ message: "Comment added successfully", issueKey: args.issueKey, commentId: added.id }, null, 2) }] };
          }

          case "jira_add_attachment": {
            const args = request.params.arguments as AddAttachmentArgs;
            if (!args?.issueKey || !args?.filePath) throw new McpError(ErrorCode.InvalidParams, "issueKey and filePath are required");

            const resolvedPath = path.resolve(args.filePath);
            if (!fs.existsSync(resolvedPath)) throw new McpError(ErrorCode.InvalidParams, `File not found: ${resolvedPath}`);

            const result = await this.jira.addAttachmentOnIssue(args.issueKey, fs.createReadStream(resolvedPath));
            return { content: [{ type: "text", text: JSON.stringify({ message: "Attachment added successfully", issueKey: args.issueKey, filePath: resolvedPath, attachment: result }, null, 2) }] };
          }

          case "generate_excel": {
            const args = request.params.arguments as GenerateExcelArgs;
            if (!args?.fileName || !args?.columns || !args?.rows) throw new McpError(ErrorCode.InvalidParams, "fileName, columns, and rows are required");

            const wb = new ExcelJS.Workbook();
            const ws = wb.addWorksheet(args.sheetName || 'Sheet1');
            ws.columns = args.columns.map(col => ({ header: col.header, key: col.key, width: col.width || 30 }));

            ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
            ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E7D32' } };
            ws.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

            for (const row of args.rows) ws.addRow(row);
            ws.eachRow((row) => { row.alignment = { ...row.alignment, wrapText: true }; });

            const outDir = args.outputDir ? path.resolve(args.outputDir) : process.cwd();
            if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

            const filePath = path.join(outDir, `${args.fileName}.xlsx`);
            await wb.xlsx.writeFile(filePath);

            return { content: [{ type: "text", text: JSON.stringify({ message: "Excel file generated successfully", filePath, fileName: `${args.fileName}.xlsx`, rowCount: args.rows.length, columnCount: args.columns.length }, null, 2) }] };
          }

          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
        }
      } catch (error) {
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }], isError: true };
      }
    });
  }

  public async run(): Promise<void> {
    const transport = process.env.TRANSPORT || "stdio";

    if (transport === "http") {
      const app = express();
      app.use(express.json());

      app.post("/mcp", async (req, res) => {
        const httpTransport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        await this.server.connect(httpTransport);
        await httpTransport.handleRequest(req, res, req.body);
        res.on("close", () => { httpTransport.close(); });
      });

      app.get("/health", (_req, res) => res.json({ status: "ok" }));

      const port = parseInt(process.env.PORT || "3000", 10);
      app.listen(port, "0.0.0.0", () => {
        console.error(`Jira MCP server running on http://0.0.0.0:${port}/mcp`);
      });
    } else {
      await this.server.connect(new StdioServerTransport());
      console.error("Jira MCP server running on stdio");
    }
  }
}

const jiraServer = new JiraServer();
jiraServer.run().catch((error: Error) => console.error(error));
