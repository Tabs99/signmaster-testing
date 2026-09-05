/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        keyline: {
          page: '#0A121C',
          pane: '#0C1521',
          plate: '#111C28',
          gold: '#E9B23C',
          'gold-pressed': '#D9A436',
          'gold-foreground': '#0A121C',
        },
        accent: {
          gold: '#E9B23C',
        },
        error: {
          DEFAULT: '#E0776C',
          text: '#EA9A91',
        },
        success: {
          DEFAULT: '#5FB783',
          text: '#8FD3AA',
        },
      },
      fontFamily: {
        sans: [
          'Archivo',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
        mono: [
          'IBM Plex Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'monospace',
        ],
      },
      screens: {
        xs: '375px',
        sm: '640px',
        md: '768px',
        lg: '1024px',
        xl: '1280px',
      },
      minWidth: {
        mobile: '375px',
      },
      maxWidth: {
        activation: '420px',
      },
      letterSpacing: {
        step: '0.16em',
        field: '0.14em',
        product: '0.11em',
      },
      backgroundImage: {
        'gradient-cta': 'linear-gradient(135deg, #f5cc5a 0%, #e08c18 100%)',
      },
    },
  },
  plugins: [],
}
