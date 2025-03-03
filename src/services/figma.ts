import axios, { AxiosError } from "axios";
import { FigmaError } from "~/types/figma";
import fs from "fs";
import {
  parseFigmaFileResponse,
  parseFigmaResponse,
  SimplifiedDesign,
} from "./simplify-node-response";
import type { GetFileResponse, GetFileNodesResponse } from "@figma/rest-api-spec";

export class FigmaService {
  private readonly apiKey: string;
  private readonly baseUrl = "https://api.figma.com/v1";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(endpoint: string): Promise<T> {
    try {
      console.log(`Calling ${this.baseUrl}${endpoint}`);
      const response = await axios.get(`${this.baseUrl}${endpoint}`, {
        headers: {
          "X-Figma-Token": this.apiKey,
        },
      });

      return response.data;
    } catch (error) {
      if (error instanceof AxiosError && error.response) {
        throw {
          status: error.response.status,
          err: (error.response.data as { err?: string }).err || "Unknown error",
        } as FigmaError;
      }
      throw new Error("Failed to make request to Figma API");
    }
  }

  async getFile(fileKey: string, depth?: number): Promise<SimplifiedDesign> {
    try {
      const endpoint = `/files/${fileKey}${depth ? `?depth=${depth}` : ""}`;
      console.log(`Calling ${this.baseUrl}${endpoint}`);
      const response = await this.request<GetFileResponse>(endpoint);
      console.log("Got response");
      const simplifiedResponse = parseFigmaFileResponse(response);
      writeLogs("figma-raw.json", response);
      writeLogs("figma-simplified.json", simplifiedResponse);
      return simplifiedResponse;
    } catch (e) {
      console.log("hi?");
      console.error("Failed to get file:", e);
      throw e;
    }
  }

  async getNode(fileKey: string, nodeId: string, depth?: number): Promise<SimplifiedDesign> {
    const endpoint = `/files/${fileKey}/nodes?ids=${nodeId}${depth ? `&depth=${depth}` : ""}`;
    const response = await this.request<GetFileNodesResponse>(endpoint);
    writeLogs("figma-raw.json", response);
    const simplifiedResponse = parseFigmaResponse(response);
    writeLogs("figma-simplified.json", simplifiedResponse);
    return simplifiedResponse;
  }

  /**
   * 获取Figma文件中的图片资源 (https://www.figma.com/developers/api#get-images-endpoint)
   * @param fileKey Figma文件的key
   * @param nodeIds 需要获取图片的节点ID数组
   * @param format 图片格式，可选值：jpg, png, svg, pdf
   * @param scale 图片缩放比例
   * @param svgIncludeId 是否在SVG中包含ID
   * @param svgSimplifyStroke 是否简化SVG中的描边
   * @param useAbsoluteBounds 是否使用绝对边界
   * @returns 包含图片URL的对象，键为节点ID，值为图片URL
   */
  async getImages(
    fileKey: string,
    nodeIds: string[],
    options?: {
      format?: 'jpg' | 'png' | 'svg' | 'pdf',
      scale?: number,
      svgIncludeId?: boolean,
      svgSimplifyStroke?: boolean,
      useAbsoluteBounds?: boolean
    }
  ): Promise<{ images: Record<string, string>, imagesDesc: string }> {
    try {
      // 构建查询参数
      const queryParams = new URLSearchParams();
      queryParams.append('ids', nodeIds.join(','));

      if (options) {
        if (options.format) queryParams.append('format', options.format);
        if (options.scale) { queryParams.append('scale', options.scale.toString()) } else {
          queryParams.append('scale', '0.8');
        };
        if (options.svgIncludeId !== undefined) queryParams.append('svg_include_id', options.svgIncludeId.toString());
        if (options.svgSimplifyStroke !== undefined) queryParams.append('svg_simplify_stroke', options.svgSimplifyStroke.toString());
        if (options.useAbsoluteBounds !== undefined) queryParams.append('use_absolute_bounds', options.useAbsoluteBounds.toString());
      }

      const endpoint = `/images/${fileKey}?${queryParams.toString()}`;
      let response = await this.request<{ images: Record<string, string>, err?: string, imagesDesc?: string }>(endpoint);

      writeLogs("figma-images.json", response);

      if (response.err) {
        throw new Error(response.err);
      }

      const imagesDesc = "images字段中的key是节点id，value是图片url";
      return {
        images: response.images,
        imagesDesc,
      };
    } catch (e) {
      console.error("Failed to get images:", e);
      throw e;
    }
  }
}

function writeLogs(name: string, value: any) {
  try {
    if (process.env.NODE_ENV !== "development") return;

    const logsDir = "logs";

    try {
      fs.accessSync(process.cwd(), fs.constants.W_OK);
    } catch (error) {
      console.log("Failed to write logs:", error);
      return;
    }

    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir);
    }
    fs.writeFileSync(`${logsDir}/${name}`, JSON.stringify(value, null, 2));
  } catch (error) {
    console.debug("Failed to write logs:", error);
  }
}
