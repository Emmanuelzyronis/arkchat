/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        background: '#0F172A',
        foreground: '#F8FAFC',
        card: '#111827',
        'card-foreground': '#F8FAFC',
        primary: '#2563EB',
        'primary-foreground': '#FFFFFF',
        secondary: '#3B82F6',
        accent: '#EA580C',
        muted: '#1E293B',
        'muted-foreground': '#CBD5E1',
        border: '#334155',
        destructive: '#DC2626',
      },
      fontFamily: {
        sans: ['Inter', 'System'],
      },
    },
  },
  plugins: [],
};
