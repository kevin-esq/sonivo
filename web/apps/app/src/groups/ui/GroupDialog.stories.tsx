import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { GroupButton } from './GroupButton'
import { GroupDialog } from './GroupDialog'
import { GroupInput } from './GroupField'

const meta = { title: 'Sonivo/Grupo/Diálogo', component: GroupDialog } satisfies Meta<typeof GroupDialog>
export default meta
type Story = StoryObj<typeof meta>

export const FormularioCorto: Story = {
  args: { open: true, onClose: () => undefined, title: 'Nueva canción', children: null },
  render: () => {
    const Example = () => {
      const [open, setOpen] = useState(true)
      return (
        <>
          <GroupButton onClick={() => setOpen(true)}>Abrir formulario</GroupButton>
          <GroupDialog open={open} onClose={() => setOpen(false)} title="Nueva canción" description="Agrega la información principal." footer={(close) => <><GroupButton variant="secondary" onClick={close}>Cancelar</GroupButton><GroupButton onClick={close}>Continuar</GroupButton></>}>
            <GroupInput label="Título" placeholder="Ej. Canto de esperanza" data-autofocus />
          </GroupDialog>
        </>
      )
    }
    return <Example />
  },
}

export const ProteccionDeBorrador: Story = {
  args: { open: true, onClose: () => undefined, title: 'Crear canción', children: 'El formulario tiene cambios sin guardar.' },
  render: () => <GroupDialog open onClose={() => undefined} title="Crear canción" confirmDiscard>El formulario tiene cambios sin guardar.</GroupDialog>,
}
