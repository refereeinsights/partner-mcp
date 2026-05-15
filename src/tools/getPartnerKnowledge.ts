import { z } from "zod";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

type Section = { heading: string; content: string };

let _sections: Section[] | null = null;
let _toc: string[] | null = null;

function loadKnowledge() {
  if (_sections) return { sections: _sections, toc: _toc! };

  const raw = readFileSync(
    join(process.cwd(), "docs", "partner-monetization-knowledge.md"),
    "utf-8"
  );

  _sections = [];
  _toc = [];

  for (const block of raw.split(/\n(?=## )/)) {
    const firstLine = block.split("\n")[0].trim();
    const heading = firstLine.replace(/^##\s+/, "");
    _sections.push({ heading, content: block.trim() });
    _toc.push(`- ${heading}`);
  }

  return { sections: _sections, toc: _toc };
}

function findSections(query?: string, section?: string): string {
  const { sections, toc } = loadKnowledge();

  if (!query && !section) {
    return `## Table of Contents\n\n${toc.join("\n")}`;
  }

  if (section) {
    const needle = section.toLowerCase();
    const match = sections.find((s) => s.heading.toLowerCase().includes(needle));
    return match
      ? match.content
      : `Section "${section}" not found.\n\n## Table of Contents\n\n${toc.join("\n")}`;
  }

  const needle = query!.toLowerCase();
  const matches = sections.filter(
    (s) =>
      s.heading.toLowerCase().includes(needle) ||
      s.content.toLowerCase().includes(needle)
  );

  if (matches.length === 0) {
    return `No matches for "${query}".\n\n## Table of Contents\n\n${toc.join("\n")}`;
  }

  return matches.map((s) => s.content).join("\n\n---\n\n");
}

export function registerGetPartnerKnowledge(server: McpServer) {
  server.registerTool(
    "get_partner_knowledge",
    {
      title: "Get Partner Knowledge",
      description:
        "Return sections from the partner monetization knowledge file. Provide a section name, a keyword query, or neither to get the table of contents.",
      inputSchema: {
        section: z.string().optional().describe("Exact or partial section heading to return"),
        query: z.string().optional().describe("Keyword query — returns sections containing the term"),
      },
    },
    async ({ section, query }) => {
      const text = findSections(query, section);
      return { content: [{ type: "text" as const, text }] };
    }
  );
}
