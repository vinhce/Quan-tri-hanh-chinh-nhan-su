import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/context/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        canvas: 'var(--bg-canvas)',
        sidebar: 'var(--bg-sidebar)',
        surface: {
          DEFAULT: 'var(--bg-surface)',
          light: '#EFF5F3',
          card: '#FCFEFD',
          dark: '#09090B',
          'dark-card': '#121214',
        },
        'table-head': 'var(--bg-table-head)',
        'row-alt': 'var(--bg-row-alt)',
        'row-hover': 'var(--bg-row-hover)',
        'sage-subtle': 'var(--border-subtle)',
        'sage-strong': 'var(--border-strong)',
        ink: {
          DEFAULT: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
        brand: {
          DEFAULT: '#0F766E',
          hover: '#0D5F58',
        },
        'nav-active': {
          DEFAULT: 'var(--nav-active-bg)',
          text: 'var(--nav-active-text)',
        },
        accent: {
          DEFAULT: '#0F766E',
          dark: '#2DD4BF',
        },
      },
      borderRadius: {
        control: '8px',
        card: '12px',
        panel: '16px',
      },
      transitionTimingFunction: {
        unslop: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
