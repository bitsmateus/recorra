import type { Config } from 'tailwindcss';

// Paleta Recorrai — kit de marca v1.0 (public/README.txt e recorrai-brand-book.html).
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#14857C', // teal da marca
          hover: '#0C6B63', // teal escuro
          soft: '#3AA8A6',
          tint: '#E1F0EE',
        },
        // Verde da marca (o "ai" da logo) — também o positivo da interface.
        success: { DEFAULT: '#22A45D', tint: '#E4F4EA' },
        warning: { DEFAULT: '#F0A93B', tint: '#FCF0DE' }, // âmbar (pendência)
        danger: { DEFAULT: '#EF4444', tint: '#FCEBEB' },
        ink: '#16233A', // grafite (texto)
        muted: '#64748B',
        line: '#E2E8F0',
        surface: '#FFFFFF',
        canvas: '#EEF4F3', // nuvem (fundo)
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
