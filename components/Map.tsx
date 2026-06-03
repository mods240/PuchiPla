'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { BRANDS, type Store } from '@/lib/supabase'

const THEME_COLOR = '#FF69B4'
const COMPASS_KEY = 'puchipla_compass_enabled'

function getBrandColor(brand: string): string {
  return BRANDS.find(b => b.key === brand)?.color ?? '#888888'
}

interface MapProps {
  stores: Store[]
  center: [number, number]
  bookmarks: Set<number>
  onToggleBookmark: (id: number) => void
  activeBrands: Set<string>
  onChangeBrands: (brands: Set<string>) => void
}

export default function Map({ stores, center, bookmarks, onToggleBookmark, activeBrands, onChangeBrands }: MapProps) {
  const mapRef = useRef<any>(null)
  const mapDivRef = useRef<HTMLDivElement>(null)
  const markersRef = useRef<any>(null)
  const userMarkerRef = useRef<any>(null)
  const compassHandlerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null)
  const LRef = useRef<any>(null)
  const isInitialized = useRef(false)
  const headingRef = useRef<number | null>(null)

  const [selectedStore, setSelectedStore] = useState<Store | null>(null)
  const [compassEnabled, setCompassEnabled] = useState(false)
  const [heading, setHeading] = useState(0)
  const [filterOpen, setFilterOpen] = useState(false)

  // 地図初期化
  useEffect(() => {
    if (isInitialized.current || !mapDivRef.current) return
    isInitialized.current = true

    import('leaflet').then((leaflet) => {
      const L = leaflet.default ?? leaflet
      LRef.current = L

      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const map = L.map(mapDivRef.current!, {
        center,
        zoom: 14,
        zoomControl: false,
      })

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map)

      markersRef.current = L.layerGroup().addTo(map)
      mapRef.current = map
      ;(window as any)._puchiplaMap = map

      // コンパス復元
      if (localStorage.getItem(COMPASS_KEY) === 'true') {
        tryEnableCompassSilent()
      }
    })

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
        isInitialized.current = false
      }
    }
  }, [])

  // center変更時に地図を移動
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setView(center, mapRef.current.getZoom())
      updateUserMarker(center[0], center[1])
    }
  }, [center])

  // マーカー描画
  useEffect(() => {
    const L = LRef.current
    const markers = markersRef.current
    if (!L || !markers) return

    markers.clearLayers()
    stores
      .filter(s => activeBrands.has(s.brand))
      .forEach(store => {
        const color = getBrandColor(store.brand)
        const isBookmarked = bookmarks.has(store.id)
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
          <path d="M14 0C6.27 0 0 6.27 0 14c0 9.33 14 22 14 22s14-12.67 14-22C28 6.27 21.73 0 14 0z" fill="${isBookmarked ? '#FFB800' : color}"/>
          <circle cx="14" cy="14" r="6" fill="white"/>
        </svg>`
        const icon = L.divIcon({ html: svg, className: '', iconSize: [28, 36], iconAnchor: [14, 36], popupAnchor: [0, -36] })
        const marker = L.marker([store.lat, store.lon], { icon })
        marker.on('click', () => setSelectedStore(store))
        markers.addLayer(marker)
      })
  }, [stores, activeBrands, bookmarks])

  const updateUserMarker = (lat: number, lon: number) => {
    const L = LRef.current
    if (!L || !mapRef.current) return
    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([lat, lon])
    } else {
      const icon = L.divIcon({
        html: `<div style="width:16px;height:16px;background:#4285F4;border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`,
        className: '', iconSize: [16, 16], iconAnchor: [8, 8],
      })
      userMarkerRef.current = L.marker([lat, lon], { icon }).addTo(mapRef.current)
    }
  }

  const handleLocate = useCallback(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude: lat, longitude: lon } = pos.coords
        mapRef.current?.setView([lat, lon], 16)
        updateUserMarker(lat, lon)
      },
      err => console.error('位置情報取得失敗:', err),
      { enableHighAccuracy: true }
    )
  }, [])

  const tryEnableCompassSilent = () => {
    if (typeof window === 'undefined') return
    const handler = (e: DeviceOrientationEvent) => {
      const ios = (e as any).webkitCompassHeading
      const newHeading = ios != null ? ios : e.alpha != null ? 360 - e.alpha : null
      if (newHeading === null) return
      const prev = headingRef.current
      if (prev === null || Math.abs(newHeading - prev) >= 5) {
        headingRef.current = newHeading
        setHeading(Math.round(newHeading))
      }
    }
    compassHandlerRef.current = handler
    window.addEventListener('deviceorientation', handler, true)
    setCompassEnabled(true)
  }

  const handleCompass = useCallback(async () => {
    if (compassEnabled) {
      if (compassHandlerRef.current) {
        window.removeEventListener('deviceorientation', compassHandlerRef.current, true)
        compassHandlerRef.current = null
      }
      setCompassEnabled(false)
      localStorage.setItem(COMPASS_KEY, 'false')
      return
    }
    if (typeof (DeviceOrientationEvent as any).requestPermission !== 'function') {
      tryEnableCompassSilent()
      localStorage.setItem(COMPASS_KEY, 'true')
      return
    }
    try {
      const permission = await (DeviceOrientationEvent as any).requestPermission()
      if (permission === 'granted') {
        tryEnableCompassSilent()
        localStorage.setItem(COMPASS_KEY, 'true')
      }
    } catch (e) {
      console.error('コンパス権限取得失敗:', e)
    }
  }, [compassEnabled])

  const visibleCount = stores.filter(s => activeBrands.has(s.brand)).length

  return (
    <div style={{ position:'relative', height:'100%', width:'100%' }}>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />

      <div ref={mapDivRef} style={{ width:'100%', height:'100%' }} />

      {/* 件数 */}
      <div style={{
        position:'absolute', bottom:90, left:12, zIndex:1000,
        background:'rgba(255,255,255,0.92)', borderRadius:20,
        padding:'4px 12px', fontSize:13, color:'#555',
        boxShadow:'0 2px 6px rgba(0,0,0,0.1)',
      }}>📍 {visibleCount}件</div>

      {/* 絞り込みボタン */}
      <button onClick={() => setFilterOpen(v => !v)} style={{
        position:'absolute', top:12, right:12, zIndex:1000,
        background:'white', border:`2px solid ${THEME_COLOR}`, borderRadius:20,
        padding:'4px 12px', fontSize:13, fontWeight:'bold',
        color:THEME_COLOR, cursor:'pointer',
        boxShadow:'0 2px 6px rgba(0,0,0,0.1)',
      }}>絞込 ({activeBrands.size}/{BRANDS.length})</button>

      {/* フィルターパネル */}
      {filterOpen && (
        <div style={{
          position:'absolute', top:48, left:0, right:0, zIndex:999,
          background:'white', padding:'12px 16px',
          boxShadow:'0 4px 12px rgba(0,0,0,0.15)',
          display:'flex', flexWrap:'wrap', gap:8,
        }}>
          {BRANDS.map(b => (
            <button key={b.key} onClick={() => {
              const next = new Set(activeBrands)
              next.has(b.key) ? next.delete(b.key) : next.add(b.key)
              onChangeBrands(next)
            }} style={{
              padding:'4px 12px', borderRadius:20, fontSize:13,
              border:`2px solid ${b.color}`,
              background: activeBrands.has(b.key) ? b.color : 'white',
              color: activeBrands.has(b.key) ? 'white' : b.color,
              cursor:'pointer', fontWeight:'bold',
            }}>{b.label}</button>
          ))}
          <button onClick={() => onChangeBrands(new Set(BRANDS.map(b => b.key)))} style={{
            padding:'4px 12px', borderRadius:20, fontSize:13,
            border:'2px solid #ccc', background:'#f5f5f5', color:'#666', cursor:'pointer',
          }}>全選択</button>
        </div>
      )}

      {/* コンパスボタン */}
      <button onClick={handleCompass} style={{
        position:'absolute', bottom:80, right:12, zIndex:1000,
        width:44, height:44, borderRadius:'50%',
        background:'white', border:`2px solid ${compassEnabled ? THEME_COLOR : '#ccc'}`,
        fontSize:22, cursor:'pointer',
        display:'flex', alignItems:'center', justifyContent:'center',
        boxShadow:'0 2px 8px rgba(0,0,0,0.2)',
        transform: compassEnabled ? `rotate(${heading}deg)` : 'none',
        transition: compassEnabled ? 'transform 0.2s' : 'none',
      }}>🧭</button>

      {/* 現在地ボタン */}
      <button onClick={handleLocate} style={{
        position:'absolute', bottom:32, right:12, zIndex:1000,
        width:44, height:44, borderRadius:'50%',
        background:'white', border:`2px solid ${THEME_COLOR}`,
        fontSize:22, cursor:'pointer',
        display:'flex', alignItems:'center', justifyContent:'center',
        boxShadow:'0 2px 8px rgba(0,0,0,0.2)',
      }}>📍</button>

      {/* 店舗詳細パネル */}
      {selectedStore && (
        <div style={{
          position:'absolute', bottom:0, left:0, right:0, zIndex:1001,
          background:'white', borderRadius:'16px 16px 0 0',
          padding:'20px 20px 32px',
          boxShadow:'0 -4px 20px rgba(0,0,0,0.15)',
        }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div style={{ flex:1 }}>
              <div style={{
                display:'inline-block', padding:'2px 10px', borderRadius:12,
                background: getBrandColor(selectedStore.brand),
                color:'white', fontSize:12, fontWeight:'bold', marginBottom:6,
              }}>{selectedStore.brand}</div>
              <div style={{ fontSize:18, fontWeight:'bold', color:'#333' }}>
                {selectedStore.name || selectedStore.brand}
              </div>
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <button onClick={() => onToggleBookmark(selectedStore.id)} style={{
                background:'none', border:'none', fontSize:24, cursor:'pointer',
                color: bookmarks.has(selectedStore.id) ? '#FFB800' : '#ddd',
              }}>{bookmarks.has(selectedStore.id) ? '⭐' : '☆'}</button>
              <button onClick={() => setSelectedStore(null)} style={{
                background:'none', border:'none', fontSize:24, cursor:'pointer', color:'#aaa',
              }}>×</button>
            </div>
          </div>
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${selectedStore.lat},${selectedStore.lon}`}
            target="_blank" rel="noopener noreferrer"
            style={{
              display:'block', marginTop:16, padding:'12px',
              background:'linear-gradient(135deg,#FF69B4,#FFB6C1)',
              color:'white', textAlign:'center', borderRadius:12,
              textDecoration:'none', fontWeight:'bold', fontSize:15,
            }}
          >🗺️ Googleマップで案内</a>
        </div>
      )}
    </div>
  )
}
