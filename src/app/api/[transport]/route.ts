import { createMcpHandler } from "mcp-handler";
import { registerGetPartnerPipeline } from "../../../tools/getPartnerPipeline";
import { registerGetPartnerLinks } from "../../../tools/getPartnerLinks";
import { registerGetPartnerClickSummary } from "../../../tools/getPartnerClickSummary";
import { registerGetFanaticsRouting } from "../../../tools/getFanaticsRouting";
import { registerGetPartnerKnowledge } from "../../../tools/getPartnerKnowledge";

export const runtime = "nodejs";
export const maxDuration = 60;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id",
};

function checkAuth(request: Request): Response | null {
  const apiKey = process.env.MCP_API_KEY;

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      // MCP_API_KEY must be set in production — fail safe
      return new Response(
        JSON.stringify({ error: "Server misconfigured: MCP_API_KEY is not set" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    // Local dev: allow unauthenticated access when MCP_API_KEY is not set
    return null;
  }

  const auth = request.headers.get("Authorization");
  if (!auth || auth !== `Bearer ${apiKey}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  return null;
}

// TODO: Replace bearer token with OAuth or Vercel-supported MCP auth flow.
const mcpHandler = createMcpHandler(
  (server) => {
    registerGetPartnerPipeline(server);
    registerGetPartnerLinks(server);
    registerGetPartnerClickSummary(server);
    registerGetFanaticsRouting(server);
    registerGetPartnerKnowledge(server);
  },
  {},
  { basePath: "/api", maxDuration: 60 }
);

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: Request) {
  const authError = checkAuth(request);
  if (authError) return authError;
  return mcpHandler(request);
}

export async function POST(request: Request) {
  const authError = checkAuth(request);
  if (authError) return authError;
  return mcpHandler(request);
}
