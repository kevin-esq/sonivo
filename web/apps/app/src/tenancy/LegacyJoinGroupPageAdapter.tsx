'use client'

import { useNavigate } from 'react-router-dom'
import { JoinGroupPage } from './JoinGroupPage'

export function LegacyJoinGroupPageAdapter() {
  const navigate = useNavigate()
  return <JoinGroupPage navigate={navigate} />
}
