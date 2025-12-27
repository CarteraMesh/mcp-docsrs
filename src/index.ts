#!/usr/bin/env bun

import { parseArgs } from "node:util"
import { createRustDocsServer } from "./server.js"
import type { ServerConfig } from "./types.js"

// Parse command line arguments
const { values, positionals } = parseArgs({
	args: process.argv.slice(2),
	options: {
		help: { type: "boolean", short: "h" },
		version: { type: "boolean", short: "v" },
		port: { type: "string" },
		stdio: { type: "boolean" },
		"cache-ttl": { type: "string" },
		"max-cache-size": { type: "string" },
		"request-timeout": { type: "string" },
		"db-path": { type: "string" }
	},
	allowPositionals: true
})

// Show help if requested
if (values.help || positionals.includes("help")) {
	console.log(`
MCP Rust Docs Server

A Model Context Protocol server for fetching Rust crate documentation from docs.rs

Usage:
  mcp-docsrs [options]

Options:
  -h, --help              Show this help message
  --version               Show version information
  --port <port>           HTTP server port (default: 3331)
  --stdio                 Use stdio transport instead of HTTP
  --cache-ttl <ms>        Cache TTL in milliseconds (default: 3600000)
  --max-cache-size <n>    Maximum cache entries (default: 100)
  --request-timeout <ms>  Request timeout in milliseconds (default: 30000)
  --db-path <path>        Path to cache directory (cache.db will be created inside) or ":memory:" (default: :memory:)

Environment Variables:
  PORT                    HTTP server port
  CACHE_TTL               Cache TTL in milliseconds
  MAX_CACHE_SIZE          Maximum cache entries
  REQUEST_TIMEOUT         Request timeout in milliseconds
  DB_PATH                 Path to cache directory (cache.db will be created inside)

Examples:
  # Run HTTP server (default)
  mcp-docsrs

  # Run on custom port
  mcp-docsrs --port 8080

  # Run with stdio transport
  mcp-docsrs --stdio

  # Run with custom cache settings
  mcp-docsrs --cache-ttl 7200000 --max-cache-size 200

  # Run with persistent database
  mcp-docsrs --db-path /path/to/cache/directory

MCP Integration:
  For stdio mode with Claude Desktop, add to your claude_desktop_config.json:
  {
    "mcpServers": {
      "rust-docs": {
        "command": "mcp-docsrs",
        "args": ["--stdio"]
      }
    }
  }
`)
	process.exit(0)
}

// Show version if requested
if (values.version) {
	const packageJson = require("../package.json")
	console.log(`mcp-docsrs v${packageJson.version}`)
	process.exit(0)
}

// Check transport mode
const useStdio = values.stdio || false
const port = Number.parseInt((values.port as string) || process.env.PORT || "3331")

// Configuration from command line and environment variables
const cacheTtl = Number.parseInt(
	(values["cache-ttl"] as string) || process.env.CACHE_TTL || "3600000"
)
const maxCacheSize = Number.parseInt(
	(values["max-cache-size"] as string) || process.env.MAX_CACHE_SIZE || "100"
)
const requestTimeout = Number.parseInt(
	(values["request-timeout"] as string) || process.env.REQUEST_TIMEOUT || "30000"
)
const dbPath = (values["db-path"] as string) || process.env.DB_PATH

// Validate configuration
if (!useStdio && (Number.isNaN(port) || port <= 0 || port > 65535)) {
	console.error("Error: Invalid port value")
	process.exit(1)
}

if (Number.isNaN(cacheTtl) || cacheTtl <= 0) {
	console.error("Error: Invalid cache TTL value")
	process.exit(1)
}

if (Number.isNaN(maxCacheSize) || maxCacheSize <= 0) {
	console.error("Error: Invalid max cache size value")
	process.exit(1)
}

if (Number.isNaN(requestTimeout) || requestTimeout <= 0) {
	console.error("Error: Invalid request timeout value")
	process.exit(1)
}

// Create config object after validation
const config: ServerConfig = {
	cacheTtl,
	maxCacheSize,
	requestTimeout,
	dbPath,
	port: useStdio ? undefined : port,
	useStdio
}

// Error handling
process.on("uncaughtException", (error) => {
	console.error("Uncaught exception:", error)
	process.exit(1)
})

process.on("unhandledRejection", (reason, promise) => {
	console.error("Unhandled rejection at:", promise, "reason:", reason)
	process.exit(1)
})

// Create and start server
const { start, cleanup } = createRustDocsServer(config)

// Handle graceful shutdown
process.on("SIGINT", () => {
	console.error("\nShutting down gracefully...")
	cleanup()
	process.exit(0)
})

process.on("SIGTERM", () => {
	console.error("\nShutting down gracefully...")
	cleanup()
	process.exit(0)
})

// Start the server
start().catch((error) => {
	console.error("Failed to start MCP server:", error)
	cleanup()
	process.exit(1)
})
