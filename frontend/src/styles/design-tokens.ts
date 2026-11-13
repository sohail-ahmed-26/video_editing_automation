/**
 * Studio — Design System Tokens
 * Strict, consistent design constants for professional creative workspace UI.
 */

export const DESIGN_TOKENS = {
  colors: {
    bg: {
      canvas: '#090a0f',
      surface: '#11131a',
      card: '#161923',
      cardHover: '#1d212e',
      panel: '#13151e',
      overlay: 'rgba(0, 0, 0, 0.75)',
    },
    border: {
      subtle: '#1c202c',
      default: '#222634',
      light: '#2e3447',
      focus: '#8b5cf6',
    },
    text: {
      primary: '#f1f3f9',
      secondary: '#c2c8d7',
      muted: '#8b93a7',
      subtle: '#5c6479',
      inverse: '#090a0f',
    },
    accent: {
      violet300: '#c4b5fd',
      violet400: '#a78bfa',
      violet500: '#8b5cf6', // Electric Violet Core
      violet600: '#7c3aed',
      violet700: '#6d28d9',
      glow: 'rgba(139, 92, 246, 0.25)',
    },
    status: {
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444',
      info: '#3b82f6',
    },
  },
  typography: {
    fontSans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontMono: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
  },
  spacing: {
    headerHeight: '4rem', // 64px
    sidebarWidth: '16rem', // 256px
    timelineMinHeight: '14rem', // 224px
  },
  radius: {
    sm: '0.375rem', // 6px
    md: '0.5rem',   // 8px
    lg: '0.75rem',  // 12px
    xl: '1rem',     // 16px
    full: '9999px',
  },
  shadows: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.4)',
    md: '0 4px 12px 0 rgba(0, 0, 0, 0.5), 0 1px 3px 0 rgba(0, 0, 0, 0.3)',
    lg: '0 12px 32px 0 rgba(0, 0, 0, 0.6), 0 2px 6px 0 rgba(0, 0, 0, 0.4)',
    glow: '0 0 24px -4px rgba(139, 92, 246, 0.35)',
  },
  transitions: {
    fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
    normal: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
    slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
  },
  zIndex: {
    header: 20,
    sidebar: 30,
    modalBackdrop: 50,
    modalContent: 51,
    tooltip: 60,
  },
  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  },
} as const;

export type DesignTokens = typeof DESIGN_TOKENS;

