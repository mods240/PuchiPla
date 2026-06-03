"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { supabase, BRANDS, type Store } from "@/lib/supabase";

const Map = dynamic(() => import("@/components/Map"), {
  ssr: false,
  loading: () => (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', background:'#fff0f6' }}>
      <p style={{ color:'#FF69B4' }}>🛍️ 地図を読み込み中...</p>
    </div>
  ),
});

const ALL_REGIONS = [
  { name: '関東',     emoji: '🗼', desc: '東京・神奈川・埼玉・千葉など',     dbName: '関東' },
  { name: '関西',     emoji: '🏯', desc: '大阪・京都・兵庫・奈良など',       dbName: '関西' },
  { name: '中京',     emoji: '🏙️', desc: '愛知・岐阜・三重・静岡',           dbName: '中京' },
  { name: '北海道',   emoji: '🐻', desc: '北海道全域',                       dbName: '北海道' },
  { name: '東北',     emoji: '⛄', desc: '宮城・福島・青森・岩手など',       dbName: '東北' },
  { name: '北陸・信越', emoji: '🦀', desc: '新潟・長野・富山・石川・福井',   dbName: '北陸信越' },
  { name: '中国・四国', emoji: '🍋', desc: '広島・岡山・香川・愛媛など',     dbName: '中国四国' },
  { name: '九州',     emoji: '🌋', desc: '福岡・熊本・鹿児島・長崎など',     dbName: '九州' },
  { name: '沖縄',     emoji: '🌺', desc: '沖縄全島',                         dbName: '沖縄' },
];

// エリアごとのbbox（lat_min, lat_max, lon_min, lon_max）
const REGION_BBOX: Record<string, [number, number, number, number]> = {
  '関東':     [35.0, 36.2, 138.8, 140.9],
  '関西':     [34.0, 35.5, 134.5, 136.0],
  '中京':     [34.5, 35.5, 136.5, 138.0],
  '北海道':   [41.5, 45.5, 139.5, 145.8],
  '東北':     [36.8, 41.5, 139.5, 141.8],
  '北陸・信越': [35.5, 37.8, 136.0, 139.0],
  '中国・四国': [32.5, 35.5, 130.5, 134.5],
  '九州':     [31.0, 34.0, 129.5, 132.0],
  '沖縄':     [24.0, 27.1, 122.9, 128.3],
};

const REGION_CENTERS: Record<string, [number, number]> = {
  '関東':     [35.68, 139.69],
  '関西':     [34.69, 135.50],
  '中京':     [35.18, 136.91],
  '北海道':   [43.06, 141.35],
  '東北':     [38.27, 140.87],
  '北陸・信越': [36.69, 137.21],
  '中国・四国': [34.40, 132.46],
  '九州':     [33.59, 130.42],
  '沖縄':     [26.21, 127.68],
};

function sortRegionsByLocation(lat: number, lng: number) {
  return [...ALL_REGIONS].sort((a, b) => {
    const [aLat, aLng] = REGION_CENTERS[a.name] || [35, 135];
    const [bLat, bLng] = REGION_CENTERS[b.name] || [35, 135];
    const distA = Math.sqrt((lat - aLat) ** 2 + (lng - aLng) ** 2);
    const distB = Math.sqrt((lat - bLat) ** 2 + (lng - bLng) ** 2);
    return distA - distB;
  });
}

function calcDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)}km`;
}

const STORAGE_KEY = 'puchipla_selected_regions';
const BOOKMARK_KEY = 'puchipla_bookmarks';
const DEFAULT_CENTER: [number, number] = [34.69, 135.50];
type ViewType = "map" | "list" | "bookmarks";

export default function Home() {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [sortedRegions, setSortedRegions] = useState(ALL_REGIONS);
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set());
  const [showRegionSelect, setShowRegionSelect] = useState(false);
  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [hasLocation, setHasLocation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(true);
  const [view, setView] = useState<ViewType>("map");
  const [initialized, setInitialized] = useState(false);
  const [activeBrands, setActiveBrands] = useState<Set<string>>(new Set(BRANDS.map(b => b.key)));
  const [searchQuery, setSearchQuery] = useState("");
  const currentPosRef = useRef<[number, number] | null>(null);

  // 位置情報取得
  useEffect(() => {
    if (!navigator.geolocation) { setLocating(false); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setCenter(coords);
        setHasLocation(true);
        setLocating(false);
        currentPosRef.current = coords;
        setSortedRegions(sortRegionsByLocation(coords[0], coords[1]));
      },
      () => setLocating(false),
      { timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  // 初期化
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) { setSelectedRegions(JSON.parse(saved)); }
    else { setShowRegionSelect(true); }
    const savedBookmarks = localStorage.getItem(BOOKMARK_KEY);
    if (savedBookmarks) { setBookmarks(new Set(JSON.parse(savedBookmarks))); }
    setInitialized(true);
  }, []);

  useEffect(() => {
    if (!initialized || selectedRegions.length === 0) return;
    fetchStores(selectedRegions);
  }, [selectedRegions, initialized]);

  async function fetchStores(regions: string[]) {
    setLoading(true);
    // 選択エリアのbboxを合算
    let latMin = 90, latMax = -90, lonMin = 180, lonMax = -180;
    regions.forEach(r => {
      const bbox = REGION_BBOX[r];
      if (!bbox) return;
      latMin = Math.min(latMin, bbox[0]);
      latMax = Math.max(latMax, bbox[1]);
      lonMin = Math.min(lonMin, bbox[2]);
      lonMax = Math.max(lonMax, bbox[3]);
    });

    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .filter('lat', 'gte', latMin)
      .filter('lat', 'lte', latMax)
      .filter('lon', 'gte', lonMin)
      .filter('lon', 'lte', lonMax)
      .limit(3000);

    if (error) { console.error('fetchStores error:', error); setLoading(false); return; }
    const raw = data || [];
    const pos = currentPosRef.current;
    if (pos) {
      setStores(raw.map(s => ({ ...s, distance: calcDistance(pos[0], pos[1], s.lat, s.lon) })));
    } else {
      setStores(raw);
    }
    setLoading(false);
  }

  const toggleBookmark = useCallback((id: number) => {
    setBookmarks(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      localStorage.setItem(BOOKMARK_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  function handleRegionToggle(region: string) {
    setSelectedRegions(prev =>
      prev.includes(region) ? prev.filter(r => r !== region) : [...prev, region]
    );
  }

  function handleRegionConfirm() {
    if (selectedRegions.length === 0) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedRegions));
    setShowRegionSelect(false);
  }

  const sortedStores = [...stores].sort((a, b) => {
    const da = (a as any).distance;
    const db = (b as any).distance;
    if (da != null && db != null) return da - db;
    if (da != null) return -1;
    if (db != null) return 1;
    return (a.name || '').localeCompare(b.name || '');
  });

  const filteredStores = sortedStores.filter(s => activeBrands.has(s.brand));

  const searchedStores = searchQuery.trim()
    ? filteredStores.filter(s =>
        (s.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.brand.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : filteredStores;

  const bookmarkedStores = filteredStores.filter(s => bookmarks.has(s.id));

  // エリア選択画面
  if (showRegionSelect) {
    return (
      <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh', background:'#fff0f6' }}>
        <header style={{ background:'linear-gradient(135deg,#FF69B4,#FFB6C1)', color:'white', padding:'16px', textAlign:'center' }}>
          <h1 style={{ fontSize:24, fontWeight:'bold', margin:0 }}>🛍️ プチプラプラプラ</h1>
          <p style={{ fontSize:13, margin:'4px 0 0', opacity:0.9 }}>使うエリアを選んでください</p>
        </header>
        <div style={{ flex:1, padding:'16px' }}>
          <p style={{ fontSize:12, color:'#888', textAlign:'center', marginBottom:16 }}>複数選択できます。後から変更も可能です。</p>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {sortedRegions.map(region => {
              const isSelected = selectedRegions.includes(region.name);
              return (
                <button key={region.name} onClick={() => handleRegionToggle(region.name)}
                  style={{
                    display:'flex', alignItems:'center', gap:12, padding:16,
                    borderRadius:16, border:`2px solid ${isSelected ? '#FF69B4' : '#FFD6E7'}`,
                    background: isSelected ? '#FF69B4' : 'white',
                    color: isSelected ? 'white' : '#333',
                    cursor:'pointer', textAlign:'left',
                  }}
                >
                  <span style={{ fontSize:28 }}>{region.emoji}</span>
                  <div style={{ flex:1 }}>
                    <p style={{ fontWeight:'bold', fontSize:14, margin:0 }}>{region.name}</p>
                    <p style={{ fontSize:12, margin:'2px 0 0', opacity:0.7 }}>{region.desc}</p>
                  </div>
                  {isSelected && <span style={{ fontSize:18 }}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ position:'sticky', bottom:0, padding:16, background:'#fff0f6', borderTop:'1px solid #FFD6E7' }}>
          <button onClick={handleRegionConfirm} disabled={selectedRegions.length === 0}
            style={{
              width:'100%', padding:16, borderRadius:16, border:'none',
              background: selectedRegions.length > 0 ? 'linear-gradient(135deg,#FF69B4,#FFB6C1)' : '#ddd',
              color: selectedRegions.length > 0 ? 'white' : '#999',
              fontWeight:'bold', fontSize:16, cursor: selectedRegions.length > 0 ? 'pointer' : 'not-allowed',
            }}
          >
            {selectedRegions.length > 0 ? `${selectedRegions.join('・')}で始める 🛍️` : 'エリアを選んでください'}
          </button>
        </div>
      </div>
    );
  }

  const StoreListItem = ({ store }: { store: Store & { distance?: number } }) => {
    const isBookmarked = bookmarks.has(store.id);
    const brandColor = BRANDS.find(b => b.key === store.brand)?.color ?? '#888';
    return (
      <li style={{ padding:'12px 16px', background:'white', borderBottom:'1px solid #FFD6E7' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
              <span style={{ padding:'2px 8px', borderRadius:10, background:brandColor, color:'white', fontSize:11, fontWeight:'bold', whiteSpace:'nowrap' }}>
                {store.brand}
              </span>
              <span
                style={{ fontSize:13, fontWeight:'bold', color:'#333', cursor:'pointer', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                onClick={() => {
                  setView("map");
                  setTimeout(() => {
                    const map = (window as any)._puchiplaMap;
                    if (map) map.setView([store.lat, store.lon], 17);
                  }, 100);
                }}
              >
                {store.name || store.brand}
              </span>
            </div>
            {store.distance != null && (
              <p style={{ fontSize:12, color:'#FF69B4', margin:0 }}>📍 {formatDistance(store.distance)}</p>
            )}
          </div>
          <div style={{ display:'flex', gap:8, marginLeft:8 }}>
            <button onClick={() => toggleBookmark(store.id)}
              style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color: isBookmarked ? '#FFB800' : '#ddd' }}
            >{isBookmarked ? '⭐' : '☆'}</button>
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lon}`}
              target="_blank" rel="noopener noreferrer"
              style={{ padding:'4px 8px', background:'#FF69B4', color:'white', borderRadius:8, fontSize:11, textDecoration:'none', whiteSpace:'nowrap' }}
            >案内</a>
          </div>
        </div>
      </li>
    );
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100dvh', background:'#fff0f6' }}>
      {/* ヘッダー */}
      <header style={{
        background:'linear-gradient(135deg,#FF69B4,#FFB6C1)', color:'white',
        padding:'10px 16px', display:'flex', alignItems:'center', justifyContent:'space-between',
        boxShadow:'0 2px 8px rgba(0,0,0,0.15)',
      }}>
        <button onClick={() => setShowRegionSelect(true)} style={{ background:'none', border:'none', color:'white', textAlign:'left', cursor:'pointer', padding:0 }}>
          <div style={{ fontWeight:'bold', fontSize:18 }}>🛍️ プチプラプラプラ</div>
          <div style={{ fontSize:11, opacity:0.85 }}>タップでエリア変更</div>
        </button>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:12, opacity:0.9 }}>
            {loading ? '読込中...' : `${filteredStores.length}件`}
          </span>
          <a href="/about" style={{ fontSize:11, color:'rgba(255,255,255,0.85)', textDecoration:'none', border:'1px solid rgba(255,255,255,0.5)', borderRadius:10, padding:'2px 8px' }}>
            ℹ️ about
          </a>
        </div>
      </header>

      {/* タブ */}
      <div style={{ display:'flex', background:'white', borderBottom:'1px solid #FFD6E7' }}>
        {(['map','list','bookmarks'] as ViewType[]).map(v => {
          const label = v === 'map' ? '🗺️ 地図' : v === 'list' ? '📋 リスト' : `⭐ ${bookmarks.size > 0 ? bookmarks.size : ''}`;
          return (
            <button key={v} onClick={() => setView(v)}
              style={{
                flex:1, padding:'10px 0', fontSize:13, fontWeight:'bold', border:'none',
                background:'none', cursor:'pointer',
                color: view === v ? '#FF69B4' : '#aaa',
                borderBottom: view === v ? '2px solid #FF69B4' : '2px solid transparent',
              }}
            >{label}</button>
          );
        })}
      </div>

      {/* コンテンツ */}
      <div style={{ flex:1, overflow:'hidden' }}>
        {loading || locating ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%' }}>
            <p style={{ color:'#FF69B4' }}>🛍️ 読み込み中...</p>
          </div>
        ) : view === 'map' ? (
          <div style={{ height:'100%' }}>
            <Map
              stores={filteredStores}
              center={center}
              bookmarks={bookmarks}
              onToggleBookmark={toggleBookmark}
              activeBrands={activeBrands}
              onChangeBrands={setActiveBrands}
            />
          </div>
        ) : view === 'bookmarks' ? (
          <div style={{ height:'100%', overflowY:'auto' }}>
            {bookmarkedStores.length === 0 ? (
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:160, gap:8 }}>
                <p style={{ color:'#aaa', fontSize:14 }}>お気に入りはまだありません</p>
                <p style={{ color:'#ccc', fontSize:12 }}>リストの ☆ から登録できます</p>
              </div>
            ) : (
              <ul style={{ listStyle:'none', margin:0, padding:0 }}>
                {bookmarkedStores.map(s => <StoreListItem key={s.id} store={s as any} />)}
              </ul>
            )}
          </div>
        ) : (
          <div style={{ height:'100%', display:'flex', flexDirection:'column', overflow:'hidden' }}>
            {/* 検索バー */}
            <div style={{ padding:'8px 12px', background:'white', borderBottom:'1px solid #FFD6E7' }}>
              <div style={{ position:'relative' }}>
                <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#ccc' }}>🔍</span>
                <input
                  type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="店舗名・ブランドで検索..."
                  style={{ width:'100%', padding:'8px 32px', border:'1px solid #FFD6E7', borderRadius:20, fontSize:13, background:'#fff0f6', outline:'none', boxSizing:'border-box', color:'#333' }}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')}
                    style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'#ccc', cursor:'pointer' }}
                  >✕</button>
                )}
              </div>
            </div>
            <div style={{ flex:1, overflowY:'auto' }}>
              {searchedStores.length === 0 ? (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:120 }}>
                  <p style={{ color:'#aaa', fontSize:14 }}>店舗が見つかりません</p>
                </div>
              ) : (
                <ul style={{ listStyle:'none', margin:0, padding:0 }}>
                  {searchedStores.map(s => <StoreListItem key={s.id} store={s as any} />)}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
