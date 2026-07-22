import { describe, expect, test } from 'bun:test';
import { scaffoldArgs, validateProjectName } from './project';

describe('project onboarding', () => {
    test('validates Cloudflare-safe project names', () => {
        expect(validateProjectName('pixel-shop')).toBeUndefined();
        expect(validateProjectName('Pixel Shop')).toBeString();
        expect(validateProjectName('x-')).toBeString();
    });

    test('uses the Cloudflare framework generator without deploying early', () => {
        const args = scaffoldArgs({ name: 'pixel-shop', framework: 'react', data: 'd1', deploy: 'temporary' });
        expect(args).toContain('--framework=react');
        expect(args).toContain('--platform=workers');
        expect(args).toContain('--no-deploy');
        expect(args).toContain('--agents');
    });

    test('uses the assets Worker template for vanilla apps', () => {
        const args = scaffoldArgs({ name: 'pixel-shop', framework: 'vanilla', data: 'none', deploy: 'local' });
        expect(args).toContain('--type=hello-world-with-assets');
    });
});
