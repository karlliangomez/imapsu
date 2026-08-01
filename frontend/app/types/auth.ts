export type UserRoleType = 'student' | 'aspiring-tenant' | 'current-tenant' | 'oas' | 'admin'

export interface UserRole {
  id: number
  documentId?: string
  name: string
  description?: string
  type: UserRoleType
}

export interface User {
  id: number
  documentId?: string
  username: string
  email: string
  confirmed?: boolean
  blocked?: boolean
  role?: UserRole | null
  createdAt?: string
  updatedAt?: string
}

export interface AuthResponse {
  jwt: string
  user: User
}
