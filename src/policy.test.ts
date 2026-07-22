import { describe, expect, test } from 'bun:test';
import { classifyCommand, redactOutput } from './policy';

describe('command policy', () => {
    test('allows inspection and deployment dry-runs', () => {
        expect(classifyCommand('rg -n worker src').kind).toBe('allow');
        expect(classifyCommand('bunx wrangler deploy --dry-run').kind).toBe('allow');
    });

    test('requires approval for live Cloudflare writes', () => {
        expect(classifyCommand('bunx wrangler deploy --env staging').kind).toBe('approve');
        expect(classifyCommand('bunx wrangler secret put API_KEY').kind).toBe('approve');
    });

    test('denies broadly destructive commands', () => {
        expect(classifyCommand('rm -rf /').kind).toBe('deny');
        expect(classifyCommand('git reset --hard HEAD~1').kind).toBe('deny');
    });

    test('denies secret file reads even through safe-looking commands', () => {
        expect(classifyCommand('cat .env').kind).toBe('deny');
        expect(classifyCommand('rg TOKEN .dev.vars').kind).toBe('deny');
    });

    test('does not auto-allow compound commands or paths outside the project', () => {
        expect(classifyCommand('rg worker src && touch changed').kind).toBe('approve');
        expect(classifyCommand('cat /etc/hosts').kind).toBe('approve');
    });

    test('redacts likely credentials', () => {
        expect(redactOutput('key=sk-abcdefghijklmnopqrstuvwxyz')).not.toContain('abcdefghijklmnopqrstuvwxyz');
    });
});
