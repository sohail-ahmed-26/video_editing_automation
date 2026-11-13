/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        studio: {
          bg: '#0B0C0E',
          surface: '#121317',
          raised: '#181A1F',
          card: '#181A1F',
          cardHover: '#1d2027',
          panel: '#121317',
          border: '#23262D',
          borderLight: '#2e333d',
          divider: '#23262D',
          text: '#ECEDEF',
          muted: '#8B909A',
          subtle: '#5a5f6b',
          accent: '#C8A96A',
          'accent-hover': '#D8BC82',
          success: '#5FA37A',
          danger: '#C75B5B',
        },
        accent: {
          DEFAULT: '#C8A96A',
          hover: '#D8BC82',
        },
        success: '#5FA37A',
        danger: '#C75B5B',
      },
      borderRadius: {
        DEFAULT: '8px',
        sm: '4px',
        md: '6px',
        lg: '8px',
        xl: '10px',
        '2xl': '12px',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      maxWidth: {
        'content': '920px',
      },
      boxShadow: {
        'none': 'none',
        'subtle': '0 1px 2px 0 rgba(0, 0, 0, 0.3)',
      },
    },
  },
  plugins: [],
}
