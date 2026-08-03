/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // New VCardz theme — indigo-blue brand
        background: '#F7F8FA',
        foreground: '#1E1B2E',
        card: '#FFFFFF',
        'card-foreground': '#1E1B2E',
        popover: '#FFFFFF',
        'popover-foreground': '#1E1B2E',
        primary: '#4F46E5',
        'primary-foreground': '#FFFFFF',
        secondary: '#F0F1F4',
        'secondary-foreground': '#4A4A5A',
        muted: '#F2F3F5',
        'muted-foreground': '#6B6B7B',
        accent: '#4F46E5',
        'accent-foreground': '#FFFFFF',
        destructive: '#DC2626',
        border: '#E4E4E9',
        input: '#E4E4E9',
        ring: '#4F46E5',
        // Custom
        surface: '#F4F5F7',
        'surface-2': '#E9EAEE',
        brand: '#4F46E5',
        'brand-dim': 'rgba(79, 70, 229, 0.12)',
        // Sidebar
        sidebar: '#F5F6F8',
        'sidebar-foreground': '#2A2A3A',
        'sidebar-primary': '#4F46E5',
        'sidebar-primary-foreground': '#FFFFFF',
        'sidebar-accent': 'rgba(79, 70, 229, 0.10)',
        'sidebar-accent-foreground': '#4F46E5',
        'sidebar-border': '#E4E4E9',
        'sidebar-ring': '#4F46E5',
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
      },
      borderRadius: {
        card: '0.875rem',
      },
    },
  },
  plugins: [],
}