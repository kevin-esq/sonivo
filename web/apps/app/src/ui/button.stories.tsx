import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Button } from './button'

const meta = {
  title: 'Sonivo/General/Botón',
  component: Button,
  args: { children: 'Continuar' },
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'outline', 'ghost', 'danger'] },
    size: { control: 'select', options: ['sm', 'default', 'lg'] },
  },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Principal: Story = { args: { variant: 'primary' } }
export const Secundario: Story = { args: { variant: 'secondary' } }
export const Enfocado: Story = { args: { variant: 'secondary', autoFocus: true } }
export const Deshabilitado: Story = { args: { disabled: true } }
export const Cargando: Story = { args: { children: 'Guardando…', disabled: true, 'aria-busy': true } }
