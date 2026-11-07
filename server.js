import express from 'express';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

// Build a fresh MCP server with the two tools
function buildServer() {
  const server = new McpServer({ name: 'tgb-test-mcp', version: '1.0.0' });

  server.registerTool(
    'roll_dice',
    {
      title: 'Roll dice',
      description: 'Roll a six-sided die and return a number from 1 to 6.',
      inputSchema: {}
    },
    async () => {
      const value = Math.floor(Math.random() * 6) + 1;
      return { content: [{ type: 'text', text: String(value) }] };
    }
  );

  server.registerTool(
    'add',
    {
      title: 'Add',
      description: 'Add two numbers and return the sum.',
      inputSchema: { a: z.number().describe('First number'), b: z.number().describe('Second number') }
    },
    async ({ a, b }) => ({ content: [{ type: 'text', text: String(a + b) }] })
  );

  return server;
}

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/', (req, res) => {
  res.json({ ok: true, service: 'tgb-test-mcp', endpoint: '/mcp', tools: ['roll_dice', 'add'] });
});

// Stateless Streamable HTTP: a new server and transport per request
app.post('/mcp', async (req, res) => {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    transport.close();
    server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('MCP request failed:', err);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  }
});

const notAllowed = (req, res) => {
  res.status(405).set('Allow', 'POST').json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });
};
app.get('/mcp', notAllowed);
app.delete('/mcp', notAllowed);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`MCP server listening on ${PORT} at /mcp`));
