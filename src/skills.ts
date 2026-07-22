import { homedir } from "node:os"
import { join } from "node:path"

export const SKILL_NAMES = [
  "cloudflare",
  "wrangler",
  "workers-best-practices",
  "agents-sdk",
] as const

export type SkillName = (typeof SKILL_NAMES)[number]

const descriptions: Record<SkillName, string> = {
  cloudflare: "Choose the right Cloudflare product, architecture, storage, and AI primitives.",
  wrangler: "Use the current Wrangler CLI safely for local development, validation, resources, and deploys.",
  "workers-best-practices": "Author and review production Cloudflare Workers and wrangler.jsonc files.",
  "agents-sdk": "Build stateful Cloudflare agents, chat, scheduling, workflows, MCP, and durable execution.",
}

const skillDirectories: Record<SkillName, string> = {
  cloudflare: "cloudflare",
  wrangler: "wrangler",
  "workers-best-practices": "workers-best-practices",
  "agents-sdk": "agents-sdk",
}

export function skillCatalog(): string {
  return SKILL_NAMES.map((name) => `- ${name}: ${descriptions[name]}`).join("\n")
}

export function isSkillName(value: string): value is SkillName {
  return (SKILL_NAMES as readonly string[]).includes(value)
}

export async function loadSkill(name: SkillName): Promise<string> {
  const codexHome = process.env.CODEX_HOME ?? join(homedir(), ".codex")
  const candidates = [
    join(codexHome, "skills", skillDirectories[name], "SKILL.md"),
    join(import.meta.dir, "..", "skills", `${name}.md`),
  ]

  for (const path of candidates) {
    const file = Bun.file(path)
    if (await file.exists()) {
      const contents = await file.text()
      return contents.slice(0, 50_000)
    }
  }

  return `Skill ${name} is unavailable. Retrieve current guidance from https://developers.cloudflare.com/ before relying on remembered APIs.`
}
