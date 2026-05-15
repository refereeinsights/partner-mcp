import { readFileSync } from "node:fs";
import { join } from "node:path";

export const runtime = "nodejs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function GET() {
  const yaml = readFileSync(join(process.cwd(), "public", "openapi.yaml"), "utf-8");
  return new Response(yaml, {
    headers: { "Content-Type": "application/yaml", ...CORS_HEADERS },
  });
}
