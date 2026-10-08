import { apiRequest } from './http'

/** ADR-0055 W-G: group tasks. */
export type TaskItem = {
  id: string
  title: string
  notes: string | null
  status: string
  dueAt: string | null
  assigneeUserId: string | null
  createdByUserId: string
  createdAt: string
  updatedAt: string
  version: number
}

export async function listTasks(groupId: string): Promise<TaskItem[]> {
  return apiRequest<TaskItem[]>(`/api/groups/${groupId}/tasks`)
}

export async function createTask(
  groupId: string,
  input: { title: string; notes?: string | null; dueAt?: string | null; assigneeUserId?: string | null },
): Promise<TaskItem> {
  return apiRequest<TaskItem>(`/api/groups/${groupId}/tasks`, { method: 'POST', body: input })
}

export async function updateTask(
  groupId: string,
  taskId: string,
  input: { title: string; notes?: string | null; dueAt?: string | null; assigneeUserId?: string | null; expectedVersion: number },
): Promise<TaskItem> {
  return apiRequest<TaskItem>(`/api/groups/${groupId}/tasks/${taskId}`, {
    method: 'PATCH',
    body: input,
  })
}

export async function setTaskStatus(
  groupId: string,
  taskId: string,
  input: { status: string; expectedVersion: number },
): Promise<TaskItem> {
  return apiRequest<TaskItem>(`/api/groups/${groupId}/tasks/${taskId}/status`, {
    method: 'POST',
    body: input,
  })
}

export async function deleteTask(groupId: string, taskId: string, expectedVersion: number): Promise<void> {
  await apiRequest<void>(`/api/groups/${groupId}/tasks/${taskId}`, {
    method: 'DELETE',
    body: { expectedVersion },
  })
}
