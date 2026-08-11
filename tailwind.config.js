/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // VCardz theme — slate / navy fintech
        background: '#EEF3F8',
        foreground: '#2D3D52',
        card: '#FFFFFF',
        'card-foreground': '#2D3D52',
        popover: '#FFFFFF',
        'popover-foreground': '#2D3D52',
        primary: '#5F7894',
        'primary-foreground': '#FFFFFF',
        secondary: '#F4F7FA',
        'secondary-foreground': '#60748B',
        muted: '#F1F5F8',
        'muted-foreground': '#718398',
        accent: '#6E88A3',
        'accent-foreground': '#FFFFFF',
        destructive: '#C95F65',
        border: '#DCE5ED',
        input: '#DCE5ED',
        ring: '#7B95AF',
        // Custom
        surface: '#F6F8FA',
        'surface-2': '#EAF0F5',
        brand: '#5F7894',
        'brand-dim': 'rgba(95, 120, 148, 0.11)',
        // Softer slate-blue card family
        'navy-1': '#5e7590',
        'navy-2': '#7189a3',
        'navy-3': '#90a6bb',
        // Sidebar (admin panel only — kept as-is besides shared token shift)
        sidebar: '#F5F6F8',
        'sidebar-foreground': '#2A2A3A',
        'sidebar-primary': '#5F7894',
        'sidebar-primary-foreground': '#FFFFFF',
        'sidebar-accent': 'rgba(95, 120, 148, 0.10)',
        'sidebar-accent-foreground': '#5F7894',
        'sidebar-border': '#E4E4E9',
        'sidebar-ring': '#1E293B',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      spacing: {
        // Restrained spacing scale
        18: '4.5rem',
        22: '5.5rem',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
        'card-hover': '0 4px 6px -1px rgb(15 23 42 / 0.06), 0 2px 4px -2px rgb(15 23 42 / 0.06)',
        soft: '0 2px 10px -2px rgb(15 23 42 / 0.06), 0 8px 24px -8px rgb(15 23 42 / 0.08)',
        panel: '0 -8px 30px -8px rgb(15 23 42 / 0.14)',
      },
      borderRadius: {
        card: '0.875rem',
      },
    },
  },
  plugins: [],
}
