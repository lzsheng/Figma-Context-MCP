import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { FigmaService } from "./services/figma";
import { YApiService } from "./services/yapi";
import express, { Request, Response } from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { IncomingMessage, ServerResponse } from "http";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

export class FigmaMcpServer {
  private readonly server: McpServer;
  private readonly figmaService: FigmaService;
  private readonly yapiService: YApiService;
  private sseTransport: SSEServerTransport | null = null;

  constructor(figmaApiKey: string, yapiBaseUrl: string, yapiToken: string) {
    this.figmaService = new FigmaService(figmaApiKey);
    this.yapiService = new YApiService(yapiBaseUrl, yapiToken);
    this.server = new McpServer({
      name: "Figma MCP Server",
      version: "0.1.4",
    });

    this.registerTools();
  }

  private registerTools(): void {
    // Tool to get api interface information
    this.server.tool(
      "get_api_desc",
      "获取YApi中特定接口的详细信息",
      {
        apiId: z.string().describe("YApi接口的ID；如连接/project/1/interface/api/66，则ID为66"),
      },
      async ({ apiId }) => {
        const id = apiId;
        try {
          console.log(`获取API接口: ${id}`);
          const apiInterface = await this.yapiService.getApiInterface(id);
          console.log(`成功获取API接口: ${apiInterface.title || id}`);
          
          // 格式化返回数据，使其更易于阅读
          const formattedResponse = {
            基本信息: {
              接口ID: apiInterface._id,
              接口名称: apiInterface.title,
              接口路径: apiInterface.path,
              请求方式: apiInterface.method,
              接口描述: apiInterface.desc
            },
            请求参数: {
              URL参数: apiInterface.req_params,
              查询参数: apiInterface.req_query,
              请求头: apiInterface.req_headers,
              请求体类型: apiInterface.req_body_type,
              表单参数: apiInterface.req_body_form
            },
            响应信息: {
              响应类型: apiInterface.res_body_type,
              响应内容: apiInterface.res_body
            },
            其他信息: {
              接口文档: apiInterface.markdown
            }
          };
          
          return {
            content: [{ type: "text", text: JSON.stringify(formattedResponse, null, 2) }],
          };
        } catch (error) {
          console.error(`获取API接口 ${id} 时出错:`, error);
          return {
            content: [{ type: "text", text: `获取API接口出错: ${error}` }],
          };
        }
      },
    );

    // Tool to get file information
    // this.server.tool(
    //   "get_file",
    //   "Get layout information about an entire Figma file",
    //   {
    //     fileKey: z.string().describe("The key of the Figma file to fetch"),
    //     depth: z.number().optional().describe("How many levels deep to traverse the node tree"),
    //   },
    //   async ({ fileKey, depth }) => {
    //     try {
    //       console.log(`Fetching file: ${fileKey} (depth: ${depth ?? "default"})`);
    //       const file = await this.figmaService.getFile(fileKey, depth);
    //       console.log(`Successfully fetched file: ${file.name}`);
    //       const { nodes, ...metadata } = file;

    //       // Stringify each node individually to try to avoid max string length error with big files
    //       const nodesJson = `[${nodes.map((node) => JSON.stringify(node, null, 2)).join(",")}]`;
    //       const metadataJson = JSON.stringify(metadata, null, 2);
    //       const resultJson = `{ "metadata": ${metadataJson}, "nodes": ${nodesJson} }`;

    //       return {
    //         content: [{ type: "text", text: resultJson }],
    //       };
    //     } catch (error) {
    //       console.error(`Error fetching file ${fileKey}:`, error);
    //       return {
    //         content: [{ type: "text", text: `Error fetching file: ${error}` }],
    //       };
    //     }
    //   },
    // );

    // Tool to get node information
    this.server.tool(
      "get_node",
      "Get layout information about a specific node in a Figma file",
      {
        fileKey: z.string().describe("The key of the Figma file containing the node"),
        nodeId: z.string().describe("The ID of the node to fetch"),
        depth: z.number().optional().describe("How many levels deep to traverse the node tree"),
      },
      async ({ fileKey, nodeId, depth }) => {
        try {
          console.log(
            `Fetching node: ${nodeId} from file: ${fileKey} (depth: ${depth ?? "default"})`,
          );
          // 获取节点信息
          let node = await this.figmaService.getNode(fileKey, nodeId, depth);
          // 获取节点图片
          const nodeImages = await this.figmaService.getImages(fileKey, [nodeId]);

          if (node.thumbnailUrl) {
            delete node.thumbnailUrl; // 这张图片没啥用，删掉
          }

          node.previewImages = nodeImages;

          console.log(
            `Successfully fetched node: ${node.name} (ids: ${Object.keys(node.nodes).join(", ")})`,
          );
          return {
            content: [{ type: "text", text: JSON.stringify(node, null, 2) }],
          };
        } catch (error) {
          console.error(`Error fetching node ${nodeId} from file ${fileKey}:`, error);
          return {
            content: [{ type: "text", text: `Error fetching node: ${error}` }],
          };
        }
      },
    );
  }

  async connect(transport: Transport): Promise<void> {
    console.log("Connecting to transport...");
    await this.server.connect(transport);
    console.log("Server connected and ready to process requests");
  }

  async startHttpServer(port: number): Promise<void> {
    const app = express();

    app.get("/sse", async (req: Request, res: Response) => {
      console.log("New SSE connection established");
      this.sseTransport = new SSEServerTransport(
        "/messages",
        res as unknown as ServerResponse<IncomingMessage>,
      );
      await this.server.connect(this.sseTransport);
    });

    app.post("/messages", async (req: Request, res: Response) => {
      if (!this.sseTransport) {
        // @ts-expect-error Not sure why Express types aren't working
        res.sendStatus(400);
        return;
      }
      await this.sseTransport.handlePostMessage(
        req as unknown as IncomingMessage,
        res as unknown as ServerResponse<IncomingMessage>,
      );
    });

    app.listen(port, () => {
      console.log(`HTTP server listening on port ${port}`);
      console.log(`SSE endpoint available at http://localhost:${port}/sse`);
      console.log(`Message endpoint available at http://localhost:${port}/messages`);
    });
  }
}
