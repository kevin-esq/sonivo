import type { Preview } from '@storybook/nextjs-vite'
import { useEffect } from 'react'
import '../app/globals.css'
import { LanguageProvider } from '../src/i18n'

const preview: Preview = {
  decorators: [
    (Story, context) => {
      const theme = context.globals.theme === 'light' ? 'light' : 'dark'
      const fullBleed = context.parameters.fullBleed === true
      useEffect(() => {
        document.documentElement.dataset.theme = theme
      }, [theme])
      return (
        <LanguageProvider>
          <div className={`min-h-screen bg-canvas text-ink ${fullBleed ? '' : 'p-5 sm:p-8'}`}>
            <div className={fullBleed ? 'w-full' : 'mx-auto w-full max-w-3xl'}>
              <Story />
            </div>
          </div>
        </LanguageProvider>
      )
    },
  ],
  globalTypes: {
    theme: {
      description: 'Tema visual de Sonivo',
      toolbar: {
        title: 'Tema',
        icon: 'paintbrush',
        items: [
          { value: 'dark', title: 'Oscuro' },
          { value: 'light', title: 'Claro' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: 'dark' },
  parameters: {
    a11y: { test: 'error' },
    controls: { expanded: true },
    layout: 'fullscreen',
    options: { storySort: { method: 'alphabetical' } },
  },
  tags: ['autodocs'],
}

export default preview
