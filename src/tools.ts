import { relative, resolve, sep } from 'node:path';
import type { FunctionTool } from 'openai/resources/responses/responses';
import { classifyCommand, redactOutput } from './policy';
import { isSkillName, loadSkill } from './skills';

export interface ToolContext {
    root: string;
    approve: (title: string, detail: string) => Promise<boolean>;
    status: (message: string) => void;
}

export const tools: FunctionTool[] = [
    {
        type: 'function',
        name: 'load_skill',
        description:
            'Load one installed Cloudflare skill before using its specialized guidance. Load wrangler before Wrangler commands and workers-best-practices before Worker code/config changes.',
        strict: true,
        parameters: {
            type: 'object',
            properties: { name: { type: 'string', enum: ['cloudflare', 'wrangler', 'workers-best-practices', 'agents-sdk'] } },
            required: ['name'],
            additionalProperties: false,
        },
    },
    {
        type: 'function',
        name: 'read_file',
        description: 'Read a UTF-8 project file. Secret files such as .env and .dev.vars are denied.',
        strict: true,
        parameters: {
            type: 'object',
            properties: { path: { type: 'string', description: 'Path relative to the project root.' } },
            required: ['path'],
            additionalProperties: false,
        },
    },
    {
        type: 'function',
        name: 'write_file',
        description: 'Create or replace one UTF-8 file inside the project. The user will be asked to approve the write.',
        strict: true,
        parameters: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path relative to the project root.' },
                content: { type: 'string', description: 'Complete new file contents.' },
            },
            required: ['path', 'content'],
            additionalProperties: false,
        },
    },
    {
        type: 'function',
        name: 'run_command',
        description:
            'Run one shell command in the project. Read-only inspection and dry-runs are automatic; deploys, remote mutations, and other commands require user approval. Prefer Bun and bunx wrangler.',
        strict: true,
        parameters: {
            type: 'object',
            properties: { command: { type: 'string', description: 'A single zsh command, without secret values.' } },
            required: ['command'],
            additionalProperties: false,
        },
    },
];

type ToolArgs = Record<string, unknown>;

function projectPath(root: string, requested: string): string {
    const absolute = resolve(root, requested);
    if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) throw new Error('Path escapes the project root.');
    if (/(^|\/)(\.env(?:\..*)?|\.dev\.vars|\.npmrc|\.wrangler)(\/|$)/i.test(relative(root, absolute))) {
        throw new Error('Reading or writing secret-bearing files is not allowed.');
    }
    return absolute;
}

export async function executeTool(name: string, args: ToolArgs, context: ToolContext): Promise<string> {
    if (name === 'load_skill') {
        const skill = String(args.name ?? '');
        if (!isSkillName(skill)) return JSON.stringify({ error: 'Unknown skill.' });
        context.status(`loading ${skill}`);
        return await loadSkill(skill);
    }

    if (name === 'read_file') {
        try {
            const path = projectPath(context.root, String(args.path ?? ''));
            const file = Bun.file(path);
            if (!(await file.exists())) return JSON.stringify({ error: 'File does not exist.' });
            if (file.size > 100_000)
                return JSON.stringify({ error: 'File is larger than 100 KB; inspect a smaller range with run_command.' });
            return await file.text();
        } catch (error) {
            return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
        }
    }

    if (name === 'write_file') {
        try {
            const requested = String(args.path ?? '');
            const content = String(args.content ?? '');
            const path = projectPath(context.root, requested);
            const approved = await context.approve('Write project file?', `${requested} (${Buffer.byteLength(content)} bytes)`);
            if (!approved) return JSON.stringify({ ok: false, denied: true });
            await Bun.write(path, content);
            return JSON.stringify({ ok: true, path: requested, bytes: Buffer.byteLength(content) });
        } catch (error) {
            return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
        }
    }

    if (name === 'run_command') {
        const command = String(args.command ?? '');
        if (/\bwrangler\s+secret\s+(put|bulk)\b/i.test(command)) {
            return JSON.stringify({
                ok: false,
                interactiveRequired: true,
                message: 'Secret input is intentionally not captured by the TUI. Ask the user to run this command in a separate terminal.',
            });
        }
        const decision = classifyCommand(command);
        if (decision.kind === 'deny') return JSON.stringify({ ok: false, denied: true, reason: decision.reason });
        if (decision.kind === 'approve') {
            const approved = await context.approve('Run command?', `${decision.reason}\n${command}`);
            if (!approved) return JSON.stringify({ ok: false, denied: true });
        }

        context.status(`running ${command.slice(0, 70)}`);
        const child = Bun.spawn(['zsh', '-lc', command], {
            cwd: context.root,
            stdout: 'pipe',
            stderr: 'pipe',
            env: /\bwrangler\b/.test(command) ? process.env : processEnvWithoutSecrets(),
        });
        const timeout = setTimeout(() => child.kill(), 120_000);
        const [stdout, stderr, exitCode] = await Promise.all([
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
            child.exited,
        ]);
        clearTimeout(timeout);
        return JSON.stringify({ exitCode, stdout: redactOutput(stdout), stderr: redactOutput(stderr) });
    }

    return JSON.stringify({ error: `Unknown tool: ${name}` });
}

function processEnvWithoutSecrets(): Record<string, string> {
    const allowed = [
        'PATH',
        'SHELL',
        'TERM',
        'COLORTERM',
        'LANG',
        'LC_ALL',
        'TMPDIR',
        'USER',
        'LOGNAME',
        'HOME',
        'XDG_CONFIG_HOME',
        'CLOUDFLARE_ACCOUNT_ID',
    ];
    return Object.fromEntries(allowed.flatMap((key) => (process.env[key] ? [[key, process.env[key] as string]] : [])));
}
