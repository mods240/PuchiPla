'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { fetchNearbyStores, BRANDS, type Store } from '@/lib/supabase'

const THEME_COLOR = '#FF69B4'
const DEFAULT_CENTER: [number, number] = [34.6937, 135.5023] // 大阪
const DEFAULT_ZOOM = 14
const COMPASS_KEY = 'puchipla_compass_enabled'

function getBrandColor(brand: string): string {
  return BRANDS.find(b => b.key === brand)?.color ?? '#888888'
}

function createMarkerIcon(brand: string) {
  const color = getBrandColor(brand)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
    <path d="M14 0C6.27 0 0 6.27 0 14c0 9.33 14 22 14 22s14-12.67 14-22C28 6.27 21.73 0 14 0z" fill="${color}"/>
    <circle cx="14" cy="14" r="6" fill="white"/>
  </svg>`
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    popupAnchor: [0, -36],
  })
}

export default function Map() {
  const mapRef = useRef<L.Map | null>(null)
  const mapDivRef = useRef<HTMLDivElement>(null)
  const markersRef = useRef<L.LayerGroup | null>(null)
  const userMarkerRef = useRef<L.Marker | null>(null)
  const watchIdRef = useRef<number | null>(null)
  const compassHandlerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null)

  const [stores, setStores] = useState<Store[]>([])
  const [selectedStore, setSelectedStore] = useState<Store | null>(null)
  const [compassEnabled, setCompassEnabled] = useState(false)
  const [heading, setHeading] = useState(0)
  const [activeBrands, setActiveBrands] = useState<Set<string>>(
    new Set(BRANDS.map(b => b.key))
  )
  const [filterOpen, setFilterOpen] = useState(false)
  const [userPos, setUserPos] = useState<{ lat: number; lon: number } | null>(null)

  // 地図初期化
  useEffect(() => {
    if (mapRef.current || !mapDivRef.current) return

    const map = L.map(mapDivRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)

    markersRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    // 初期データ取得
    loadStores(DEFAULT_CENTER[0], DEFAULT_CENTER[1])

    // 地図移動後に再取得
    map.on('moveend', () => {
      const center = map.getCenter()
      loadStores(center.lat, center.lng)
    })

    // iOS: 前回許可済みならサイレント再試行
    const saved = localStorage.getItem(COMPASS_KEY)
    if (saved === 'true') {
      tryEnableCompassSilent()
    }

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  const loadStores = useCallback(async (lat: number, lon: number) => {
    const data = await fetchNearbyStores(lat, lon, 5)
    setStores(data)
  }, [])

  // マーカー描画
  useEffect(() => {
    if (!markersRef.current) return
    markersRef.current.clearLayers()

    stores
      .filter(s => activeBrands.has(s.brand))
      .forEach(store => {
        const marker = L.marker([store.lat, store.lon], {
          icon: createMarkerIcon(store.brand),
        })
        marker.on('click', () => setSelectedStore(store))
        markersRef.current!.addLayer(marker)
      })
  }, [stores, activeBrands])

  // 現在地ボタン
  const handleLocate = useCallback(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude: lat, longitude: lon } = pos.coords
        setUserPos({ lat, lon })
        mapRef.current?.setView([lat, lon], 15)
        loadStores(lat, lon)
        updateUserMarker(lat, lon)
      },
      err => console.error('位置情報取得失敗:', err),
      { enableHighAccuracy: true }
    )
  }, [loadStores])

  const updateUserMarker = (lat: number, lon: number) => {
    if (!mapRef.current) return
    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([lat, lon])
    } else {
      const icon = L.divIcon({
        html: `<div style="width:16px;height:16px;background:#4285F4;border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`,
        className: '',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      })
      userMarkerRef.current = L.marker([lat, lon], { icon }).addTo(mapRef.current)
    }
  }

  // コンパスボタン
  const tryEnableCompassSilent = () => {
    if (typeof DeviceOrientationEvent === 'undefined') return
    const handler = (e: DeviceOrientationEvent) => {
      const alpha = (e as any).webkitCompassHeading ?? e.alpha
      if (alpha !== null) setHeading(Math.round(alpha))
    }
    compassHandlerRef.current = handler
    window.addEventListener('deviceorientation', handler, true)
    setCompassEnabled(true)
  }

  const handleCompass = useCallback(async () => {
    if (compassEnabled) {
      // 無効化
      if (compassHandlerRef.current) {
        window.removeEventListener('deviceorientation', compassHandlerRef.current, true)
        compassHandlerRef.current = null
      }
      setCompassEnabled(false)
      localStorage.setItem(COMPASS_KEY, 'false')
      return
    }

    // Android: 権限不要
    if (typeof (DeviceOrientationEvent as any).requestPermission !== 'function') {
      tryEnableCompassSilent()
      localStorage.setItem(COMPASS_KEY, 'true')
      return
    }

    // iOS: 権限要求
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

  const toggleBrand = (key: string) => {
    setActiveBrands(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const visibleCount = stores.filter(s => activeBrands.has(s.brand)).length

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100dvh' }}>
      {/* ヘッダー */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1000,
        background: 'linear-gradient(135deg, #FF69B4, #FFB6C1)',
        padding: '10px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 22 }}>🛍️</span>
          <span style={{ color: 'white', fontWeight: 'bold', fontSize: 16, letterSpacing: 1 }}>
            プチプラプラプラ
          </span>
        </div>
        <button
          onClick={() => setFilterOpen(v => !v)}
          style={{
            background: 'white', border: 'none', borderRadius: 20,
            padding: '4px 12px', fontSize: 13, fontWeight: 'bold',
            color: THEME_COLOR, cursor: 'pointer',
          }}
        >
          絞込 ({activeBrands.size}/{BRANDS.length})
        </button>
      </div>

      {/* フィルターパネル */}
      {filterOpen && (
        <div style={{
          position: 'absolute', top: 52, left: 0, right: 0, zIndex: 999,
          background: 'white', padding: '12px 16px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          display: 'flex', flexWrap: 'wrap', gap: 8,
        }}>
          {BRANDS.map(b => (
            <button
              key={b.key}
              onClick={() => toggleBrand(b.key)}
              style={{
                padding: '4px 12px', borderRadius: 20, fontSize: 13,
                border: `2px solid ${b.color}`,
                background: activeBrands.has(b.key) ? b.color : 'white',
                color: activeBrands.has(b.key) ? 'white' : b.color,
                cursor: 'pointer', fontWeight: 'bold',
              }}
            >
              {b.label}
            </button>
          ))}
          <button
            onClick={() => setActiveBrands(new Set(BRANDS.map(b => b.key)))}
            style={{
              padding: '4px 12px', borderRadius: 20, fontSize: 13,
              border: '2px solid #ccc', background: '#f5f5f5',
              color: '#666', cursor: 'pointer',
            }}
          >
            全選択
          </button>
        </div>
      )}

      {/* 地図 */}
      <div ref={mapDivRef} style={{ width: '100%', height: '100%' }} />

      {/* 件数表示 */}
      <div style={{
        position: 'absolute', bottom: 90, left: 16, zIndex: 1000,
        background: 'rgba(255,255,255,0.9)', borderRadius: 20,
        padding: '4px 12px', fontSize: 13, color: '#555',
        boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
      }}>
        📍 {visibleCount}件
      </div>

      {/* コンパスボタン */}
      <button
        onClick={handleCompass}
        style={{
          position: 'absolute', bottom: 80, right: 16, zIndex: 1000,
          width: 44, height: 44, borderRadius: '50%',
          background: 'white', border: `2px solid ${compassEnabled ? THEME_COLOR : '#ccc'}`,
          fontSize: 22, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          transform: compassEnabled ? `rotate(${heading}deg)` : 'none',
          transition: compassEnabled ? 'transform 0.2s' : 'none',
        }}
      >
        🧭
      </button>

      {/* 現在地ボタン */}
      <button
        onClick={handleLocate}
        style={{
          position: 'absolute', bottom: 32, right: 16, zIndex: 1000,
          width: 44, height: 44, borderRadius: '50%',
          background: 'white', border: `2px solid ${THEME_COLOR}`,
          fontSize: 22, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}
      >
        📍
      </button>

      {/* 店舗詳細パネル */}
      {selectedStore && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 1001,
          background: 'white', borderRadius: '16px 16px 0 0',
          padding: '20px 20px 32px',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{
                display: 'inline-block', padding: '2px 10px', borderRadius: 12,
                background: getBrandColor(selectedStore.brand),
                color: 'white', fontSize: 12, fontWeight: 'bold', marginBottom: 6,
              }}>
                {selectedStore.brand}
              </div>
              <div style={{ fontSize: 18, fontWeight: 'bold', color: '#333' }}>
                {selectedStore.name || selectedStore.brand}
              </div>
              <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
                {selectedStore.lat.toFixed(5)}, {selectedStore.lon.toFixed(5)}
              </div>
            </div>
            <button
              onClick={() => setSelectedStore(null)}
              style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#aaa' }}
            >
              ×
            </button>
          </div>
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${selectedStore.lat},${selectedStore.lon}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block', marginTop: 16, padding: '12px',
              background: `linear-gradient(135deg, #FF69B4, #FFB6C1)`,
              color: 'white', textAlign: 'center', borderRadius: 12,
              textDecoration: 'none', fontWeight: 'bold', fontSize: 15,
            }}
          >
            🗺️ Googleマップで案内
          </a>
        </div>
      )}
    </div>
  )
}
