export type UserRoleType = 'student' | 'aspiring-tenant' | 'current-tenant' | 'oas' | 'admin'

export interface UserRole {
  id: number
  documentId?: string
  name: string
  description?: string
  type: UserRoleType
}

export interface StrapiFile {
  id: number
  documentId?: string
  name: string
  url: string
  mime?: string
  size?: number
  width?: number
  height?: number
}

export interface User {
  id: number
  documentId?: string
  username: string
  email: string
  confirmed?: boolean
  blocked?: boolean
  role?: UserRole | null
  fullName?: string | null
  contactNumber?: string | null
  position?: string | null
  department?: string | null
  employeeId?: string | null
  officeLocation?: string | null
  bio?: string | null
  avatar?: StrapiFile | null
  createdAt?: string
  updatedAt?: string
}

export interface AuthResponse {
  jwt: string
  user: User
}
