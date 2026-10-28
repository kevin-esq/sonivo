import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { GroupSelect } from './GroupSelect'

const options = [
  { value: 'rock', label: 'Rock', description: 'Música rock' },
  { value: 'pop', label: 'Pop' },
  { value: 'other', label: 'Otro', disabled: true },
]

const meta = { title: 'Sonivo/Grupo/Selector', component: GroupSelect } satisfies Meta<typeof GroupSelect>
export default meta
type Story = StoryObj<typeof meta>

export const Predeterminado: Story = {
  args: { label: 'Género', placeholder: 'Elige un género', value: '', onChange: () => undefined, options },
  render: () => {
    const Example = () => {
      const [value, setValue] = useState('')
      return <GroupSelect label="Género" placeholder="Elige un género" value={value} onChange={setValue} options={options} />
    }
    return <Example />
  },
}

export const ConError: Story = {
  args: { label: 'Género', value: '', onChange: () => undefined, options, error: 'Selecciona una opción para continuar.' },
  render: () => <GroupSelect label="Género" value="" onChange={() => undefined} options={options} error="Selecciona una opción para continuar." />,
}

export const Deshabilitado: Story = {
  args: { label: 'Género', value: 'rock', onChange: () => undefined, options, disabled: true },
  render: () => <GroupSelect label="Género" value="rock" onChange={() => undefined} options={options} disabled />,
}
