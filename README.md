# 🛍️ プチプラプラプラ (PuchiPla)

100均・プチプラショップを地図で探せるアプリ。

## 対応ブランド
ダイソー / セリア / キャンドゥ / ワッツ / ミーツ / シルク / フレッツ / ジャパン / 3COINS / Standard Products / THREEPPY

## 技術スタック
- Next.js 14 (App Router)
- Supabase (PostgreSQL)
- Leaflet / React Leaflet
- Vercel

## セットアップ

```bash
npm install
cp .env.local.example .env.local
# .env.local にSupabase URLとAnon Keyを設定
npm run dev
```

## 環境変数
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```
