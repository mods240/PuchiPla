export async function fetchNearbyStores(
  lat: number,
  lon: number,
  radiusKm: number = 5
): Promise<Store[]> {
  const delta = radiusKm / 111

  const { data, error } = await supabase
    .from('stores')
    .select('*')
    .filter('lat', 'gte', lat - delta)
    .filter('lat', 'lte', lat + delta)
    .filter('lon', 'gte', lon - delta)
    .filter('lon', 'lte', lon + delta)
    .limit(300)

  if (error) {
    console.error('fetchNearbyStores error:', error)
    return []
  }
  return data ?? []
}
