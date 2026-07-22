import {
    Box,
    BoxRenderable,
    InputRenderable,
    InputRenderableEvents,
    ScrollBoxRenderable,
    Text,
    TextRenderable,
    createCliRenderer,
    t,
    bold,
    fg,
} from '@opentui/core';
import { CloudflareAgent, type AgentUsage } from './agent';

const colors = {
    pink: '#ff2bd6',
    cyan: '#18f7ff',
    yellow: '#ffe44d',
    purple: '#8b5cf6',
    muted: '#64748b',
    text: '#e8f0ff',
    panel: '#111126',
    panel2: '#171738',
    border: '#493d7c',
    green: '#39ff88',
    red: '#ff477e',
    bg: '#070711',
};

const cabinetFrames = [
    [
        '   ╔════════════╗',
        "  ╔╩ LOWLIFE '91╩╗",
        '  ║ ┌──────────┐ ║',
        '  ║ │    >_    │ ║',
        '  ║ └──────────┘ ║',
        '  ╠═════╦═●═●════╣',
        '  ║  ┌──╨─┐  ▪ ▪ ║',
        '  ║  └────┘  ▪ ▪ ║',
        '  ╚═══╤══════╤═══╝',
    ].join('\n'),
    [
        '  ╔════════════╗',
        " ╔╩*LOWLIFE '91*╩╗",
        ' ║ ┌──────────┐ ║',
        ' ║ │  ◆ >_ ◆  │ ║',
        ' ║ └──────────┘ ║',
        ' ╠═════╦═◉═◉════╣',
        ' ║  ┌──╨─┐  ■ ■ ║',
        ' ║  └────┘  ■ ■ ║',
        ' ╚═══╤══════╤═══╝',
    ].join('\n'),
    [
        '    ╔════════════╗',
        "   ╔╩ LOWLIFE '91╩╗",
        '   ║ ┌──────────┐ ║',
        '   ║ │ ▓▓  >_ ▓▓│ ║',
        '   ║ └──────────┘ ║',
        '   ╠═════╦═●═●════╣',
        '   ║  ┌──╨─┐  ◆ ◆ ║',
        '   ║  └────┘  ◆ ◆ ║',
        '   ╚═══╤══════╤═══╝',
    ].join('\n'),
];

const slashCommands = [
    { name: '/clear', description: 'Start a new conversation round' },
    { name: '/debug', description: 'Show or hide the debug console' },
    { name: '/help', description: 'Show available commands' },
] as const;

export async function startTui(): Promise<void> {
    const root = process.cwd();
    const agent = new CloudflareAgent(root);
    const contextWindow = Number(process.env.LOWLIFE_CONTEXT_WINDOW ?? 1_050_000);
    let busy = false;
    let usage: AgentUsage | undefined;
    let activityTick = 0;
    let debugVisible = debugEnabled();
    const debugLines: string[] = [];
    let commandMatches: readonly (typeof slashCommands)[number][] = [];
    let selectedCommand = 0;

    const renderer = await createCliRenderer({ exitOnCtrlC: true, backgroundColor: colors.bg });
    const mascot = new TextRenderable(renderer, { content: cabinetFrames[0]!, fg: colors.pink, width: 23, height: 9 });
    const usageText = new TextRenderable(renderer, { content: '● TOKENS   0%  ░░░░░░░░░░░░', fg: colors.cyan, wrapMode: 'none' });
    const status = new TextRenderable(renderer, { content: 'READY · CLOUDFLARE TARGET LOCKED', fg: colors.green, height: 1 });
    const suggestionText = new TextRenderable(renderer, { content: '', fg: colors.cyan, wrapMode: 'none', flexGrow: 1 });
    const suggestionPanel = new BoxRenderable(renderer, {
        height: slashCommands.length + 2,
        visible: false,
        flexDirection: 'column',
        marginX: 1,
        paddingX: 2,
        borderStyle: 'rounded',
        borderColor: colors.border,
        backgroundColor: colors.panel,
        title: ' COMMANDS ',
        titleColor: colors.pink,
    });
    suggestionPanel.add(suggestionText);
    const debugText = new TextRenderable(renderer, { content: '', fg: colors.muted, wrapMode: 'word', flexGrow: 1 });
    const debugPanel = new BoxRenderable(renderer, {
        height: 8,
        visible: debugVisible,
        flexDirection: 'column',
        paddingX: 2,
        border: ['top', 'bottom'],
        borderColor: colors.border,
        title: debugVisible ? ' DEBUG CONSOLE · F2 TO HIDE ' : ' DEBUG CONSOLE · F2 TO SHOW ',
        titleColor: colors.yellow,
    });
    debugPanel.add(debugText);
    const transcript = new ScrollBoxRenderable(renderer, {
        flexGrow: 1,
        stickyScroll: true,
        stickyStart: 'bottom',
        scrollY: true,
        paddingX: 2,
        contentOptions: { flexDirection: 'column', gap: 1 },
        verticalScrollbarOptions: { trackOptions: { foregroundColor: colors.purple } },
    });
    const input = new InputRenderable(renderer, {
        placeholder: 'Ask LowLifeArcade to build anything…',
        textColor: colors.text,
        focusedTextColor: colors.text,
        backgroundColor: colors.panel,
        focusedBackgroundColor: colors.panel2,
        maxLength: 16_000,
    });

    const inputWrap = new BoxRenderable(renderer, {
        height: 3,
        marginX: 1,
        paddingX: 1,
        borderStyle: 'rounded',
        borderColor: colors.purple,
        focusedBorderColor: colors.pink,
        backgroundColor: colors.panel,
    });
    inputWrap.add(input);
    const statusWrap = new BoxRenderable(renderer, { height: 1, paddingX: 2 });
    statusWrap.add(status);

    renderer.root.add(
        Box(
            { flexDirection: 'column', width: '100%', height: '100%', backgroundColor: colors.bg },
            Box(
                {
                    height: 10,
                    flexDirection: 'row',
                    paddingX: 2,
                    gap: 2,
                    border: ['bottom'],
                    borderColor: colors.pink,
                    backgroundColor: '#0d0920',
                },
                mascot,
                Box(
                    { flexDirection: 'column', flexGrow: 1, paddingTop: 1 },
                    Text({ content: t`${bold(fg(colors.cyan)('LOWLIFE'))} ${bold(fg(colors.pink)('ARCADE'))}`, height: 1 }),
                    Text({ content: 'CLOUDFLARE CODE MACHINE', fg: colors.yellow, height: 1 }),
                    Text({ content: `WORKSPACE  ${root.split('/').at(-1)}`, fg: colors.muted, height: 1 }),
                    Text({
                        content: 'Describe an app. Player Two builds, tests, and readies it for Workers.',
                        fg: colors.text,
                        wrapMode: 'word',
                    }),
                ),
                Box(
                    { width: 31, flexDirection: 'column', paddingTop: 1, alignItems: 'flex-end' },
                    usageText,
                    Text({ content: agent.model, fg: colors.muted }),
                ),
            ),
            transcript,
            debugPanel,
            suggestionPanel,
            statusWrap,
            inputWrap,
            Text({ content: '  ENTER SEND   F2 DEBUG   /clear NEW ROUND   CTRL+C QUIT', fg: colors.muted, height: 1 }),
        ),
    );

    input.on(InputRenderableEvents.ENTER, (value: string) => {
        appendDebug(`INPUT  enter event · chars=${value.length}`);
        void submit(value);
    });
    input.on(InputRenderableEvents.INPUT, (value: string) => updateSuggestions(value));
    renderer.keyInput.on('keypress', (key) => {
        if (['return', 'kpenter', 'linefeed'].includes(key.name)) appendDebug(`KEY    ${key.name} · source=${key.source}`);
        if (key.name === 'f2') toggleDebug();
        if (!suggestionPanel.visible) return;
        if (key.name === 'up' || key.name === 'down') {
            key.preventDefault();
            const direction = key.name === 'up' ? -1 : 1;
            selectedCommand = (selectedCommand + direction + commandMatches.length) % commandMatches.length;
            renderSuggestions();
        } else if (key.name === 'tab') {
            key.preventDefault();
            const command = commandMatches[selectedCommand];
            if (command) {
                input.value = command.name;
                hideSuggestions();
                appendDebug(`INPUT  autocompleted ${command.name}`);
            }
        } else if (key.name === 'escape') {
            key.preventDefault();
            hideSuggestions();
        }
    });

    addLine(
        'INSERT COIN',
        'Ask for anything. New apps default to Cloudflare Workers; framework and data choices follow the job.',
        colors.cyan,
    );
    appendDebug('READY  console online · press Enter to trace submission');
    input.focus();

    const animation = setInterval(() => {
        if (!busy) return;
        activityTick++;
        mascot.content = cabinetFrames[activityTick % cabinetFrames.length]!;
        mascot.fg = [colors.pink, colors.cyan, colors.yellow][activityTick % 3]!;
        renderUsage(true);
    }, 120);
    process.on('exit', () => clearInterval(animation));

    async function submit(submittedValue?: string): Promise<void> {
        const value = (submittedValue ?? input.value).trim();
        if (!value) return;
        if (debugEnabled()) process.stderr.write(`[lowlife ${new Date().toISOString()}] input submitted · chars=${value.length}\n`);
        input.value = '';
        if (busy) {
            setStatus('PLAYER TWO IS STILL WORKING', colors.yellow);
            return;
        }
        if (value === '/clear') {
            agent.reset();
            for (const child of transcript.getChildren()) transcript.remove(child);
            addLine('NEW ROUND', 'Conversation cleared. Cloudflare remains the default target.', colors.cyan);
            setStatus('READY · CLOUDFLARE TARGET LOCKED', colors.green);
            return;
        }
        if (value === '/debug') {
            toggleDebug();
            return;
        }
        if (value === '/help') {
            addLine(
                'COMMAND LIST',
                slashCommands.map((command) => `${command.name.padEnd(8)} ${command.description}`).join('\n'),
                colors.cyan,
            );
            return;
        }
        if (value.startsWith('/')) {
            addLine('UNKNOWN COMMAND', `${value}\nType / to see available commands.`, colors.yellow);
            return;
        }

        busy = true;
        activityTick = 1;
        mascot.content = cabinetFrames[1]!;
        addLine('PLAYER ONE', value, colors.text);
        const assistant = new TextRenderable(renderer, { content: 'PLAYER TWO\n', fg: colors.cyan, wrapMode: 'word', flexShrink: 0 });
        transcript.add(assistant);
        let failed = false;
        try {
            await agent.send(value, {
                onText: (text) => {
                    assistant.content = `PLAYER TWO\n${text}`;
                },
                onStatus: (message) => setStatus(message.toUpperCase(), colors.cyan),
                onTool: (name, detail) => addLine(`POWER-UP · ${name}`, detail.slice(0, 800), colors.purple),
                onUsage: (next) => {
                    usage = next;
                    renderUsage(true);
                },
                onDebug: appendDebug,
            });
            mascot.fg = colors.green;
        } catch (error) {
            failed = true;
            if (debugEnabled())
                process.stderr.write(
                    `[lowlife ${new Date().toISOString()}] UI caught · ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
                );
            assistant.content = `GAME OVER\n${error instanceof Error ? error.message : String(error)}`;
            assistant.fg = colors.red;
            setStatus('ERROR · READY TO RETRY', colors.red);
            mascot.fg = colors.red;
        } finally {
            busy = false;
            mascot.content = cabinetFrames[0]!;
            renderUsage(false);
            if (!failed) setStatus('READY · CLOUDFLARE TARGET LOCKED', colors.green);
            input.focus();
        }
    }

    function appendDebug(message: string): void {
        const line = `${new Date().toLocaleTimeString([], { hour12: false })}  ${message.replaceAll('\n', ' ').slice(0, 500)}`;
        debugLines.push(line);
        if (debugLines.length > 100) debugLines.splice(0, debugLines.length - 100);
        debugText.content = debugLines.slice(-6).join('\n');
    }

    function updateSuggestions(value: string): void {
        const query = value.trim().toLowerCase();
        if (!query.startsWith('/') || query.includes(' ')) {
            hideSuggestions();
            return;
        }
        commandMatches = slashCommands.filter((command) => command.name.startsWith(query));
        if (commandMatches.length === 0 || slashCommands.some((command) => command.name === query)) {
            hideSuggestions();
            return;
        }
        selectedCommand = Math.min(selectedCommand, commandMatches.length - 1);
        suggestionPanel.visible = true;
        suggestionPanel.height = commandMatches.length + 2;
        renderSuggestions();
    }

    function renderSuggestions(): void {
        suggestionText.content = commandMatches
            .map((command, index) => {
                const marker = index === selectedCommand ? '▶' : ' ';
                return `${marker} ${command.name.padEnd(9)} ${command.description}`;
            })
            .join('\n');
    }

    function hideSuggestions(): void {
        suggestionPanel.visible = false;
        commandMatches = [];
        selectedCommand = 0;
    }

    function toggleDebug(): void {
        debugVisible = !debugVisible;
        debugPanel.visible = debugVisible;
        debugPanel.title = debugVisible ? ' DEBUG CONSOLE · F2 TO HIDE ' : ' DEBUG CONSOLE · F2 TO SHOW ';
        input.focus();
    }

    function addLine(label: string, content: string, color: string): void {
        transcript.add(new TextRenderable(renderer, { content: `${label}\n${content}`, fg: color, wrapMode: 'word', flexShrink: 0 }));
    }

    function setStatus(value: string, color: string): void {
        status.content = value;
        status.fg = color;
    }

    function renderUsage(thinking: boolean): void {
        const tokens = (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0);
        const percent = Math.min(100, Math.round((tokens / contextWindow) * 100));
        const filled = Math.round(percent / 8.34);
        const spinner = thinking ? ['▖', '▘', '▝', '▗'][activityTick % 4] : '●';
        usageText.content = `${spinner} TOKENS ${String(percent).padStart(3)}%  ${'█'.repeat(filled)}${'░'.repeat(12 - filled)}`;
        usageText.fg = percent > 80 ? colors.red : percent > 60 ? colors.yellow : colors.cyan;
    }
}

function debugEnabled(): boolean {
    return process.env.LOWLIFE_DEBUG === '1' || process.env.LOWLIFE_DEBUG === 'true';
}
