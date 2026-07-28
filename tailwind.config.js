/** @type {import('tailwindcss').Config} */
// Colors map to VS Code theme variables so the webview inherits the user's
// theme (light / dark / high-contrast). shadcn-style components consume these.
module.exports = {
  content: ['./src/webview/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--vscode-editor-background)',
        fg: 'var(--vscode-editor-foreground)',
        muted: 'var(--vscode-descriptionForeground)',
        border: 'var(--vscode-panel-border)',
        card: 'var(--vscode-editorWidget-background)',
        accent: 'var(--vscode-button-background)',
        'accent-fg': 'var(--vscode-button-foreground)',
        'accent-hover': 'var(--vscode-button-hoverBackground)',
        input: 'var(--vscode-input-background)',
        'input-fg': 'var(--vscode-input-foreground)',
        'input-border': 'var(--vscode-input-border, var(--vscode-panel-border))',
        ok: 'var(--vscode-testing-iconPassed, #3fb950)',
        warn: 'var(--vscode-editorWarning-foreground, #d29922)',
      },
    },
  },
  plugins: [],
};
