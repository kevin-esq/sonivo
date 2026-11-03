import type { Ref } from 'react'
import { Plus } from 'lucide-react'
import { GroupButton } from '../ui'

type SongWizardAddButtonProps = {
  label: string
  onClick: () => void
  buttonRef?: Ref<HTMLDivElement>
  disabled?: boolean
}

export function SongWizardAddButton({ label, onClick, buttonRef, disabled = false }: SongWizardAddButtonProps) {
  return (
    <div ref={buttonRef} className="w-full sm:w-fit">
      <GroupButton type="button" variant="secondary" className="w-full" onClick={onClick} disabled={disabled}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        {label}
      </GroupButton>
    </div>
  )
}
