import type { Config } from 'tailwindcss';

// Paleta Recorrai — kit de marca v1.0 (public/README.txt e recorrai-brand-book.html).
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Cores semânticas via variáveis CSS (globals.css) para suportar tema
        // claro/escuro. Os valores de marca fixos ficam onde não mudam com o tema.
        primary: {
          DEFAULT: 'var(--primary)', // teal da marca (clareia um pouco no escuro)
          hover: '#0C6B63', // teal escuro
          soft: '#3AA8A6',
          tint: 'var(--primary-tint)',
        },
        // Verde da marca (o "ai" da logo) — também o positivo da interface.
        success: { DEFAULT: '#22A45D', tint: 'var(--success-tint)' },
        warning: { DEFAULT: '#F0A93B', tint: 'var(--warning-tint)' }, // âmbar (pendência)
        danger: { DEFAULT: '#EF4444', tint: 'var(--danger-tint)' },
        ink: 'var(--ink)', // grafite (texto)
        muted: 'var(--muted)',
        line: 'var(--line)',
        surface: 'var(--surface)',
        canvas: 'var(--canvas)', // nuvem (fundo)
      },
      borderRadius: {
        DEFAULT: '10px',
        lg: '16px',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        // Títulos e logo (Unbounded SemiBold, carregada localmente em globals.css).
        display: ['Unbounded', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
