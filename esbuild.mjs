import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const test = process.argv.includes('--test');

/** @type {esbuild.BuildOptions} */
const base = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  sourcemap: true,
  logLevel: 'info',
};

if (test) {
  await esbuild.build({
    ...base,
    entryPoints: ['test/run.ts'],
    outfile: '.test/run.mjs',
    format: 'esm',
    banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
  });
} else {
  const extensionCtx = await esbuild.context({
    ...base,
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.js',
    external: ['vscode'],
    minify: !watch,
  });
  // Webview bundle: runs in the browser context, React + JSX, no node.
  const webviewCtx = await esbuild.context({
    bundle: true,
    platform: 'browser',
    format: 'iife',
    jsx: 'automatic',
    sourcemap: true,
    logLevel: 'info',
    entryPoints: ['src/webview/main.tsx'],
    outfile: 'dist/webview.js',
    minify: !watch,
  });
  if (watch) {
    await Promise.all([extensionCtx.watch(), webviewCtx.watch()]);
  } else {
    await Promise.all([extensionCtx.rebuild(), webviewCtx.rebuild()]);
    await Promise.all([extensionCtx.dispose(), webviewCtx.dispose()]);
  }
}
