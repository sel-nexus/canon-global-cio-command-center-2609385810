/** Expose the shell's semantic colors without a second visual palette. */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        surface: 'var(--surface)',
        foreground: 'var(--foreground)',
        muted: 'var(--muted)',
        border: 'var(--border)',
        accent: 'var(--accent)',
      },
      fontFamily: { sans: ['Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif'] },
    },
  },
  plugins: [],
};
