'use client'

import dynamic from 'next/dynamic'
import { Suspense } from 'react'
import { useParams } from 'next/navigation'
import { useAppRuntime } from '@/src/appRuntime/context'
import { GroupHomePage } from '@/src/groups/GroupHomePage'

const GroupCalendarPage = dynamic(() => import('@/src/groups/GroupCalendarPage').then((module) => module.GroupCalendarPage))
const GroupTasksPage = dynamic(() => import('@/src/groups/GroupTasksPage').then((module) => module.GroupTasksPage))
const GroupRolesPage = dynamic(() => import('@/src/groups/GroupRolesPage').then((module) => module.GroupRolesPage))
const GroupResourcesPage = dynamic(() => import('@/src/groups/GroupResourcesPage').then((module) => module.GroupResourcesPage))
const GroupReportsPage = dynamic(() => import('@/src/groups/GroupReportsPage').then((module) => module.GroupReportsPage))
const LibraryPage = dynamic(() => import('@/src/repertoire/LibraryPage').then((module) => module.LibraryPage))
const SetlistListPage = dynamic(() => import('@/src/scheduling/SetlistListPage').then((module) => module.SetlistListPage))
const EventListPage = dynamic(() => import('@/src/scheduling/EventListPage').then((module) => module.EventListPage))
const PeoplePage = dynamic(() => import('@/src/tenancy/PeoplePage').then((module) => module.PeoplePage))
const SongDetailPage = dynamic(() => import('@/src/repertoire/SongDetailPage').then((module) => module.SongDetailPage))
const ArrangementDetailPage = dynamic(() => import('@/src/repertoire/ArrangementDetailPage').then((module) => module.ArrangementDetailPage))
const SetlistDetailPage = dynamic(() => import('@/src/scheduling/SetlistDetailPage').then((module) => module.SetlistDetailPage))
const EventDetailPage = dynamic(() => import('@/src/scheduling/EventDetailPage').then((module) => module.EventDetailPage))
const PracticePage = dynamic(() => import('@/src/repertoire/PracticePage').then((module) => module.PracticePage))
const GroupSettingsPage = dynamic(() => import('@/src/groups/settings/pages/GroupSettingsPage').then((module) => module.GroupSettingsPage))
const HelpPage = dynamic(() => import('@/src/help/HelpPage').then((module) => module.HelpPage))
const LegacyRouterBridge = dynamic(() => import('@/src/routing/LegacyRouterBridge').then((module) => module.LegacyRouterBridge))

function GroupRouteContentContent() {
  const { session } = useAppRuntime()
  const { groupId, section } = useParams<{ groupId: string; section?: string[] }>()

  if (session.status !== 'authenticated') return null
  const route = section?.join('/') ?? ''

  switch (route) {
    case '':
      return <GroupHomePage />
    case 'calendar':
      return <GroupCalendarPage />
    case 'library':
      return <LibraryPage user={session.user} />
    case 'setlists':
      return <SetlistListPage user={session.user} />
    case 'events':
      return <EventListPage user={session.user} />
    case 'people':
      return <PeoplePage user={session.user} />
    case 'tasks':
      return <GroupTasksPage />
    case 'roles':
      return <GroupRolesPage />
    case 'resources':
      return <GroupResourcesPage />
    case 'reports':
      return <GroupReportsPage />
    case 'help':
      return <HelpPage groupId={groupId} navigationMode="next" />
    case 'settings':
      return <GroupSettingsPage user={session.user} />
    default:
      break
  }

  if (section?.length === 2 && section[0] === 'songs') {
    return <SongDetailPage user={session.user} groupId={groupId} songId={section[1]!} />
  }
  if (section?.length === 2 && section[0] === 'arrangements') {
    return <ArrangementDetailPage user={session.user} groupId={groupId} arrangementId={section[1]!} />
  }
  if (section?.length === 2 && section[0] === 'setlists') {
    return <SetlistDetailPage user={session.user} groupId={groupId} setlistId={section[1]!} />
  }
  if (section?.length === 2 && section[0] === 'events') {
    return <EventDetailPage user={session.user} groupId={groupId} eventId={section[1]!} />
  }
  if (section?.length === 3 && section[0] === 'arrangements' && section[2] === 'practice') {
    return <PracticePage user={session.user} groupId={groupId} arrangementId={section[1]!} />
  }
  return <LegacyRouterBridge />
}

export function GroupRouteContent() {
  return <Suspense fallback={null}><GroupRouteContentContent /></Suspense>
}
