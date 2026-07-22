const mutatingWrangler =
    /\bwrangler\s+(deploy|delete|rollback|secret\s+(put|delete|bulk)|kv\s+.*\b(put|delete|create)|r2\s+.*\b(put|delete|create)|d1\s+.*\b(create|delete|execute|migrations\s+apply)|queues?\s+.*\b(create|delete)|vectorize\s+.*\b(create|delete|insert)|pages\s+deploy|versions?\s+deploy)\b/i;
const destructive = [
    /(^|[;&|]\s*)rm\s+-[^\n]*r[^\n]*f\s+(\/|~|\$HOME)(\s|$)/i,
    /\bgit\s+(reset\s+--hard|clean\s+-[^\n]*f)/i,
    /\bmkfs\b|\bdd\s+if=|:\(\)\s*\{/i,
];
const secretFileAccess = /(^|[\s'"/])(\.env(?:\.[^\s'"]*)?|\.dev\.vars|\.npmrc)([\s'"/]|$)/i;

const safeCommands = [
    /^pwd\s*$/,
    /^ls(?:\s|$)/,
    /^rg(?:\s|$)/,
    /^find\s+[^;&|]*$/,
    /^(cat|head|tail|sed)\s+[^;&|]*$/,
    /^git\s+(status|diff|log|show)(?:\s|$)/,
    /^bun\s+test(?:\s|$)/,
    /^bunx\s+tsc\s+--noEmit(?:\s|$)/,
    /^(bunx\s+)?wrangler\s+(--version|whoami|types\s+--check|deploy\s+--dry-run|check\s+startup)(?:\s|$)/,
];

export type CommandDecision = { kind: 'allow' } | { kind: 'approve'; reason: string } | { kind: 'deny'; reason: string };

export function classifyCommand(command: string): CommandDecision {
    const trimmed = command.trim();
    if (!trimmed) return { kind: 'deny', reason: 'Empty commands are not allowed.' };
    if (destructive.some((pattern) => pattern.test(trimmed))) {
        return { kind: 'deny', reason: 'This command can destroy a broad set of local data.' };
    }
    if (secretFileAccess.test(trimmed)) {
        return { kind: 'deny', reason: 'Shell access to secret-bearing files is not allowed.' };
    }
    const hasShellControl = /(;|&&|\|\||(?<!\\)\||>|<|`|\$\()/.test(trimmed);
    const hintsOutsideProject = /(^|\s)(\/(?!dev\/null(?:\s|$))|~\/|\.\.\/)/.test(trimmed);
    if (!hasShellControl && !hintsOutsideProject && safeCommands.some((pattern) => pattern.test(trimmed))) {
        return { kind: 'allow' };
    }
    if (mutatingWrangler.test(trimmed)) {
        return { kind: 'approve', reason: 'This changes live Cloudflare state.' };
    }
    return { kind: 'approve', reason: 'This command may modify files, execute project code, or access the network.' };
}

export function redactOutput(output: string): string {
    return output
        .replace(/\b(sk-[A-Za-z0-9_-]{12,})\b/g, '[REDACTED_OPENAI_KEY]')
        .replace(/\b([A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,})\b/g, '[REDACTED_TOKEN]')
        .slice(0, 30_000);
}
