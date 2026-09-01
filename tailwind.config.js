/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: {
          dark: '#0D1527',
          card: '#131D31',
          input: '#1C2942',
          page: '#07101f',
        },
        accent: {
          yellow: {
            DEFAULT: '#F59E0B',
            alt: '#EAB308',
          },
          gold: '#f0c04a',
        },
        error: '#ff6b6b',
        success: '#4ade80',
      },
      backgroundImage: {
        'gradient-page':
          'linear-gradient(165deg, #0d1b2e 0%, #0a1628 45%, #07101f 100%)',
        'gradient-cta': 'linear-gradient(135deg, #f5cc5a 0%, #e08c18 100%)',
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
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
    },
  },
  plugins: [],
}
