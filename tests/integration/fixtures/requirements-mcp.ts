import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { z } from "zod";

// A local validation fixture, not a production context integration.
export function startContextServer(requirementId: string, port = 0) {
  const app = createMcpExpressApp();
  app.post("/mcp", async (req, res) => {
    const server = new McpServer({
      name: "review-context-fixture",
      version: "0.1.0",
    });
    server.registerTool(
      "get_requirement",
      {
        description: "Read a counter product requirement by exact ID",
        inputSchema: { id: z.string() },
      },
      async ({ id }) => {
        if (id !== requirementId)
          return {
            isError: true,
            content: [{ type: "text" as const, text: "Unknown requirement." }],
          };
        console.log(JSON.stringify({ tool: "get_requirement", id }));
        return {
          content: [
            {
              type: "text",
              text: `${requirementId}: Clicking Increment must increase the displayed count by one, beginning at zero. Acceptance requires testing the browser interaction.`,
            },
          ],
        };
      },
    );
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error(error);
      if (!res.headersSent) res.status(500).end();
    }
  });
  app.get("/mcp", (_req, res) => {
    res.status(405).end();
  });
  return app.listen(port, "127.0.0.1");
}
