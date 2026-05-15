export const runtime = "nodejs";

export function GET() {
  return Response.json({
    ok: true,
    service: "tournamentinsights-partner-mcp",
    version: "0.1.0",
  });
}
