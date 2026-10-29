import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SetlistsExperiencePrototype } from '../prototypes/SetlistsExperiencePrototype'

const meta = {
  title: 'Propuestas/Listas',
  component: SetlistsExperiencePrototype,
  parameters: { layout: 'fullscreen', a11y: { test: 'error' } },
  argTypes: { variant: { control: 'select', options: ['visual', 'compact', 'next-up'] } },
} satisfies Meta<typeof SetlistsExperiencePrototype>

export default meta
type Story = StoryObj<typeof meta>

export const Visual: Story = { args: { variant: 'visual' }, name: 'A · Colección visual' }
export const Compacta: Story = { args: { variant: 'compact' }, name: 'B · Lista compacta' }
export const ProximoEncuentro: Story = { args: { variant: 'next-up' }, name: 'C · Próximo encuentro' }
