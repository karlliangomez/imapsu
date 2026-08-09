export type MapCorner = { x: number; z: number }

export type MapProperty = {
  documentId?: string
  id?: string | number
  propertyCode: string
  name: string
  building: string
  floor?: string
  space_status: 'Vacant' | 'Occupied'
  businessName?: string
  productsServices?: string
  operatingDetails?: string
  monthlyRent?: number | string
  photos?: { id: number; url?: string; name?: string }[] | null
}

export type MapZone = {
  documentId?: string
  id?: string | number
  name: string
  description?: string
  color?: string
  height?: number | string
  baseY?: number | null
  type?: string
  corners: MapCorner[]
  propertySpace?: {
    documentId?: string
    propertyCode?: string
    name?: string
    building?: string
    space_status?: string
    monthlyRent?: number | string
  } | null
}
