import { config } from "dotenv";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

// Load environment variables from .env file
config();

interface ServerConfig {
  figmaApiKey: string;
  yapiBaseUrl: string;
  yapiToken: string;
  port: number;
  configSources: {
    figmaApiKey: "cli" | "env";
    yapiBaseUrl: "cli" | "env" | "default";
    yapiToken: "cli" | "env" | "default";
    port: "cli" | "env" | "default";
  };
}

function maskApiKey(key: string): string {
  if (key.length <= 4) return "****";
  return `****${key.slice(-4)}`;
}

interface CliArgs {
  "figma-api-key"?: string;
  "yapi-base-url"?: string;
  "yapi-token"?: string;
  port?: number;
}

export function getServerConfig(): ServerConfig {
  // Parse command line arguments
  const argv = yargs(hideBin(process.argv))
    .options({
      "figma-api-key": {
        type: "string",
        description: "Figma API key",
      },
      "yapi-base-url": {
        type: "string",
        description: "YApi服务器基础URL",
      },
      "yapi-token": {
        type: "string",
        description: "YApi服务器授权Token",
      },
      port: {
        type: "number",
        description: "Port to run the server on",
      },
    })
    .help()
    .parseSync() as CliArgs;

  const config: ServerConfig = {
    figmaApiKey: "",
    yapiBaseUrl: "http://localhost:3000",
    yapiToken: "",
    port: 3333,
    configSources: {
      figmaApiKey: "env",
      yapiBaseUrl: "default",
      yapiToken: "default",
      port: "default",
    },
  };

  // Handle FIGMA_API_KEY
  if (argv["figma-api-key"]) {
    config.figmaApiKey = argv["figma-api-key"];
    config.configSources.figmaApiKey = "cli";
  } else if (process.env.FIGMA_API_KEY) {
    config.figmaApiKey = process.env.FIGMA_API_KEY;
    config.configSources.figmaApiKey = "env";
  }

  // Handle YAPI_BASE_URL
  if (argv["yapi-base-url"]) {
    config.yapiBaseUrl = argv["yapi-base-url"];
    config.configSources.yapiBaseUrl = "cli";
  } else if (process.env.YAPI_BASE_URL) {
    config.yapiBaseUrl = process.env.YAPI_BASE_URL;
    config.configSources.yapiBaseUrl = "env";
  }

  // Handle YAPI_TOKEN
  if (argv["yapi-token"]) {
    config.yapiToken = argv["yapi-token"];
    config.configSources.yapiToken = "cli";
  } else if (process.env.YAPI_TOKEN) {
    config.yapiToken = process.env.YAPI_TOKEN;
    config.configSources.yapiToken = "env";
  }

  // Handle PORT
  if (argv.port) {
    config.port = argv.port;
    config.configSources.port = "cli";
  } else if (process.env.PORT) {
    config.port = parseInt(process.env.PORT, 10);
    config.configSources.port = "env";
  }

  // Validate configuration
  if (!config.figmaApiKey) {
    console.error("FIGMA_API_KEY is required (via CLI argument --figma-api-key or .env file)");
    process.exit(1);
  }

  // Log configuration sources
  console.log("\nConfiguration:");
  console.log(
    `- FIGMA_API_KEY: ${maskApiKey(config.figmaApiKey)} (source: ${config.configSources.figmaApiKey})`,
  );
  console.log(
    `- YAPI_BASE_URL: ${config.yapiBaseUrl} (source: ${config.configSources.yapiBaseUrl})`,
  );
  console.log(
    `- YAPI_TOKEN: ${config.yapiToken ? maskApiKey(config.yapiToken) : "未配置"} (source: ${config.configSources.yapiToken})`,
  );
  console.log(`- PORT: ${config.port} (source: ${config.configSources.port})`);
  console.log(); // Empty line for better readability

  return config;
}
