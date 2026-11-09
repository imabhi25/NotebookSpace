// Just enough Node typing for tests that read a source file; the app itself targets the browser.
declare module 'node:fs' { export function readFileSync(path: string, encoding: 'utf8'): string; }
declare module 'node:path' { export function resolve(...parts: string[]): string; }
declare const __dirname: string;
