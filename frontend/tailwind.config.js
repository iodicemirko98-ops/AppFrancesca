const c = (v) => `rgb(var(--${v}) / <alpha-value>)`
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: { bg: c('bg'), card: c('card'), ink: c('ink'), mute: c('mute'), line: c('line'), accent: c('accent'), 'accent-ink': c('accent-ink'), soft: c('soft') },
      fontFamily: { sans: ['ui-rounded', '"SF Pro Rounded"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] },
      borderRadius: { '2xl': '1.25rem', '3xl': '1.75rem' },
    },
  },
}
