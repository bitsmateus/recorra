import type { Config } from 'tailwindcss';

// Paleta Recorra Teal (ver ../design/tokens.css)
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0E7C7B',
          hover: '#0B6564',
          soft: '#3AA8A6',
          tint: '#E1F5EE',
        },
        success: { DEFAULT: '#10B981', tint: '#E1F5EE' },
        warning: { DEFAULT: '#F59E0B', tint: '#FAEEDA' },
        danger: { DEFAULT: '#EF4444', tint: '#FCEBEB' },
        ink: '#0F172A',
        muted: '#64748B',
        line: '#E2E8F0',
        surface: '#FFFFFF',
        canvas: '#F8FAFC',
      },
      borderRadius: {
        DEFAULT: '10px',
        lg: '16px',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
