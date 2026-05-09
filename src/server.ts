#!/usr/bin/env node
/**
 * prompt-injection-shield MCP server.
 *
 * Exposes three tools to any MCP client (Claude Desktop, Cursor, Cline, Windsurf,
 * Zed, etc.):
 *
 *   scan_for_injection      score a piece of untrusted text and return ranked findings
 *   strip_dangerous_lines   drop the lines that fail the scan and return the rest
 *   is_safe_to_send         convenience boolean check against a configurable threshold
 *
 * Configure your client to spawn this binary over stdio. Example for Claude Desktop's
 * `claude_desktop_config.json`:
 *
 *   {
 *     "mcpServers": {
 *       "prompt-injection-shield": {
 *         "command": "npx",
 *         "args": ["-y", "@mukundakatta/prompt-injection-shield-mcp"]
 *       }
 *     }
 *   }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  scanPromptInjection,
  stripDangerousLines,
} from '@mukundakatta/prompt-injection-shield';

const VERSION = '0.1.0';

const server = new Server(
  {
    name: 'prompt-injection-shield',
    version: VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

const TOOLS = [
  {
    name: 'scan_for_injection',
    description:
      'Score a piece of untrusted text (retrieved doc, tool output, user-pasted snippet) for prompt-injection risk. Returns a 0-1 score, a `safe` boolean against the supplied threshold (default 0.7), and a list of findings — each with a rule type, severity, individual score, and the matched substring. Run this before stitching untrusted text into a system prompt.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The untrusted text to scan.',
        },
        threshold: {
          type: 'number',
          description:
            'Aggregate score above which `safe` flips to false. Default 0.7. Lower for more conservative gating.',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'strip_dangerous_lines',
    description:
      'Filter the input line-by-line, dropping any line whose own scan exceeds the default 0.7 risk threshold. Use this when you want to keep useful surrounding context but lose the lines that look like injection attempts. Returns the cleaned text and the number of lines removed.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The text to filter.',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'is_safe_to_send',
    description:
      'Convenience check: returns just `{ safe: boolean }` for the supplied text against the supplied threshold (default 0.7). Use when you only need a yes/no gate and do not care about the findings.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The text to check.',
        },
        threshold: {
          type: 'number',
          description: 'Aggregate score above which `safe` is false. Default 0.7.',
        },
      },
      required: ['text'],
    },
  },
] as const;

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  try {
    switch (name) {
      case 'scan_for_injection':
        return scanTool(args as { text: string; threshold?: number });
      case 'strip_dangerous_lines':
        return stripTool(args as { text: string });
      case 'is_safe_to_send':
        return safeTool(args as { text: string; threshold?: number });
      default:
        return errorResult('unknown tool: ' + name);
    }
  } catch (err) {
    return errorResult('internal error: ' + (err as Error).message);
  }
});

function scanTool(args: { text: string; threshold?: number }) {
  const result = scanPromptInjection(args.text, { threshold: args.threshold });
  return jsonResult(result);
}

function stripTool(args: { text: string }) {
  const original = String(args.text ?? '');
  const stripped = stripDangerousLines(original);
  const originalLines = original.split(/\r?\n/).length;
  const remaining = stripped.length === 0 ? 0 : stripped.split(/\r?\n/).length;
  return jsonResult({
    stripped,
    lines_removed: Math.max(0, originalLines - remaining),
  });
}

function safeTool(args: { text: string; threshold?: number }) {
  const { safe } = scanPromptInjection(args.text, { threshold: args.threshold });
  return jsonResult({ safe });
}

function jsonResult(value: unknown) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(message: string) {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
  };
}

const transport = new StdioServerTransport();
await server.connect(transport);

process.stderr.write(`prompt-injection-shield MCP server v${VERSION} ready on stdio\n`);
