import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Store = {
  id: number
  osm_id: string
  name: string
  brand: string
  lat: number
  lon: number
}

export const BRANDS = [
  { key: 'ダイソー',           label: 'ダイソー',            color: '#E60012' },
  { key: 'セリア',             label: 'セリア',              color: '#E8380D' },
  { key: 'キャンドゥ',         label: 'キャンドゥ',          color: '#00A0E9' },
  { key: 'ワッツ',             label: 'ワッツ',              color: '#F39700' },
  { key: 'ミーツ',             label: 'ミーツ',              color: '#8DC21F' },
  { key: 'シルク',             label: 'シルク',              color: '#9B59B6' },
  { key: 'フレッツ',           label: 'フレッツ',            color: '#1ABC9C' },
  { key: 'ジャパン',           label: 'ジャパン',            color: '#F1C40F' },
  { key: '3COINS',             label: '3COINS',              color: '#E91E8C' },
  { key: 'Standard Products',  label: 'Standard Products',   color: '#2C3E50' },
  { key: 'THREEPPY',           label: 'THREEPPY',            color: '#FF6B9D' },
]

export async function fetchNearbyStores(
  lat: number,
  lon: number,
  radiusKm: number = 3
): Promise<Store[]> {
  const delta = radiusKm / 111
  const { data, error } = await supabase
    .from('stores')
    .select('*')
    .gte('lat', lat - delta)
    .lte('lat', lat + delta)
    .gte('lon', lon - delta)
    .lte('lon', lon + delta)
    .limit(300)

  if (error) {
    console.error('fetchNearbyStores error:', error)
    return []
  }
  return data ?? []
}
