export default function Home() {
  return (
    <main style={{ fontFamily: "monospace", padding: "2rem" }}>
      <p>TournamentInsights Partner MCP server is running.</p>
      <p>
        MCP endpoint: <code>/api/mcp</code>
        <br />
        Health: <code>/api/health</code>
      </p>
    </main>
  );
}
