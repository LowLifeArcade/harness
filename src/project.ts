import { stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

export const FRAMEWORKS = [
    { name: 'React + Vite', value: 'react', description: 'SPA or full-stack React with the Cloudflare Vite plugin.' },
    { name: 'Next.js', value: 'next', description: 'App Router on Workers through the Cloudflare adapter.' },
    { name: 'Astro', value: 'astro', description: 'Content-first pages with optional SSR and islands.' },
    { name: 'SvelteKit', value: 'svelte', description: 'Svelte full-stack application on Workers.' },
    { name: 'Hono', value: 'hono', description: 'Small, fast web APIs and server-rendered applications.' },
    { name: 'TanStack Start', value: 'tanstack-start', description: 'Type-safe full-stack React with routing and server functions.' },
    { name: 'Vue', value: 'vue', description: 'Vue application configured for Cloudflare Workers.' },
    { name: 'Vanilla Worker', value: 'vanilla', description: 'TypeScript, Static Assets, and a Worker without a framework.' },
] as const;

export const DATA_OPTIONS = [
    { name: 'No data yet', value: 'none', description: 'Start stateless; add a binding only when the app needs one.' },
    { name: 'D1 SQL', value: 'd1', description: 'Serverless SQLite for relational app data, joins, and migrations.' },
    { name: 'Workers KV', value: 'kv', description: 'Globally distributed reads for settings, sessions, and cached data.' },
    { name: 'R2 Objects', value: 'r2', description: 'S3-compatible storage for uploads, media, and generated files.' },
    { name: 'D1 + R2', value: 'd1-r2', description: 'Relational metadata plus durable file/object storage.' },
    {
        name: 'Durable Objects',
        value: 'durable-objects',
        description: 'Strongly consistent state for rooms, multiplayer, and realtime coordination.',
    },
] as const;

export const DEPLOY_OPTIONS = [
    { name: 'Claimable preview', value: 'temporary', description: 'Recommended: deploy live now without Cloudflare login, then claim it.' },
    { name: 'My Cloudflare account', value: 'account', description: 'Deploy to the currently authenticated Wrangler account.' },
    { name: 'Local only', value: 'local', description: 'Scaffold and validate now; deploy later.' },
] as const;

export type FrameworkId = (typeof FRAMEWORKS)[number]['value'];
export type DataId = (typeof DATA_OPTIONS)[number]['value'];
export type DeployMode = (typeof DEPLOY_OPTIONS)[number]['value'];

export interface ProjectOptions {
    name: string;
    framework: FrameworkId;
    data: DataId;
    deploy: DeployMode;
}

export interface ProjectEvents {
    progress: (percent: number, label: string) => void;
    log: (message: string) => void;
}

export interface ProjectResult {
    root: string;
    url?: string;
    output: string;
}

export function validateProjectName(name: string): string | undefined {
    if (!/^[a-z0-9][a-z0-9-]{1,47}$/.test(name)) return 'Use 2–48 lowercase letters, numbers, and hyphens.';
    if (name.endsWith('-')) return 'Project names cannot end with a hyphen.';
    return undefined;
}

export function scaffoldArgs(options: ProjectOptions): string[] {
    const common = [options.name, '--accept-defaults', '--no-deploy', '--no-open', '--no-git', '--agents'];
    if (options.framework === 'vanilla') {
        return ['bun', 'create', 'cloudflare@latest', ...common, '--category=hello-world', '--type=hello-world-with-assets', '--lang=ts'];
    }
    return ['bun', 'create', 'cloudflare@latest', ...common, `--framework=${options.framework}`, '--platform=workers'];
}

export async function createProject(baseDirectory: string, options: ProjectOptions, events: ProjectEvents): Promise<ProjectResult> {
    const validation = validateProjectName(options.name);
    if (validation) throw new Error(validation);
    const root = resolve(baseDirectory, options.name);
    if (root !== baseDirectory && !root.startsWith(`${resolve(baseDirectory)}${sep}`))
        throw new Error('Project path escapes the workspace.');
    if (await pathExists(root)) throw new Error(`The directory ${options.name} already exists.`);

    events.progress(5, 'INSERT COIN · preparing C3');
    const scaffold = await run(scaffoldArgs(options), baseDirectory, 10 * 60_000);
    events.log(tail(scaffold.output));
    if (scaffold.exitCode !== 0) throw new Error(`Cloudflare scaffold failed.\n${tail(scaffold.output)}`);

    events.progress(58, 'BONUS STAGE · recording Cloudflare architecture');
    await writeProjectContext(root, options);

    const packageJson = await readPackageJson(root);
    if (packageJson.scripts?.build) {
        events.progress(68, 'POWER UP · building starter');
        const build = await run(['bun', 'run', 'build'], root, 5 * 60_000);
        events.log(tail(build.output));
        if (build.exitCode !== 0) throw new Error(`Starter build failed.\n${tail(build.output)}`);
    }

    events.progress(78, 'BOSS CHECK · Wrangler dry run');
    const dryRun = await run(['bunx', 'wrangler', 'deploy', '--dry-run'], root, 5 * 60_000);
    events.log(tail(dryRun.output));
    if (dryRun.exitCode !== 0) throw new Error(`Wrangler dry run failed.\n${tail(dryRun.output)}`);

    if (options.deploy === 'local') {
        events.progress(100, 'READY PLAYER ONE · local starter complete');
        return { root, output: `${scaffold.output}\n${dryRun.output}` };
    }

    events.progress(88, options.deploy === 'temporary' ? 'WARP ZONE · deploying claimable preview' : 'WARP ZONE · deploying to Cloudflare');
    const deployArgs = ['bunx', 'wrangler', 'deploy'];
    if (options.deploy === 'temporary') deployArgs.push('--temporary');
    const deployment = await run(deployArgs, root, 8 * 60_000);
    events.log(tail(deployment.output));
    if (deployment.exitCode !== 0) throw new Error(`Deployment failed.\n${tail(deployment.output)}`);

    const url = deployment.output.match(/https:\/\/[^\s\])]+/)?.[0];
    events.progress(100, 'HIGH SCORE · starter deployed');
    return { root, url, output: deployment.output };
}

interface PackageShape {
    scripts?: Record<string, string>;
}

async function readPackageJson(root: string): Promise<PackageShape> {
    try {
        return (await Bun.file(`${root}/package.json`).json()) as PackageShape;
    } catch {
        return {};
    }
}

async function writeProjectContext(root: string, options: ProjectOptions): Promise<void> {
    const framework = FRAMEWORKS.find((item) => item.value === options.framework)?.name ?? options.framework;
    const data = DATA_OPTIONS.find((item) => item.value === options.data)?.name ?? options.data;
    await Bun.write(`${root}/.lowlifearcade.json`, `${JSON.stringify({ ...options, target: 'cloudflare-workers' }, null, 2)}\n`);

    const agentsFile = Bun.file(`${root}/AGENTS.md`);
    const existing = (await agentsFile.exists()) ? await agentsFile.text() : '# Project guidance\n';
    await Bun.write(
        `${root}/AGENTS.md`,
        `${existing.trim()}\n\n## LowLifeArcade defaults\n\n- Deployment target: Cloudflare Workers.\n- Framework: ${framework}.\n- Planned data layer: ${data}. Configure it through Wrangler bindings and generated types before application code depends on it.\n- Use Bun for installs, scripts, and tests.\n- Validate locally, run a Wrangler dry-run, then deploy.\n- Never commit secrets; use Wrangler secret management.\n`,
    );
}

async function pathExists(path: string): Promise<boolean> {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

async function run(command: string[], cwd: string, timeoutMs: number): Promise<{ exitCode: number; output: string }> {
    const child = Bun.spawn(command, { cwd, stdout: 'pipe', stderr: 'pipe', env: process.env });
    const timeout = setTimeout(() => child.kill(), timeoutMs);
    const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
    ]);
    clearTimeout(timeout);
    return { exitCode, output: `${stdout}\n${stderr}`.trim().slice(-60_000) };
}

function tail(value: string, length = 1_500): string {
    return value.trim().slice(-length);
}
