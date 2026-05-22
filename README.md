# レンタルリム貸出管理 Webアプリ

スプレッドシートを使わず、在庫管理シートと同じようにHTML/CSS/JSからSupabaseへ直接読み書きする版です。

## 使い方

1. Supabase SQL Editorで `supabase_rental_rim_frontend_rls.sql` を実行します。
   手入力注文の備考列がない場合は `supabase_rental_order_extra_fields.sql` も実行します。
2. `app.js` の `SUPABASE_URL` と `SUPABASE_API_KEY` を自分のSupabaseプロジェクトに合わせます。
3. `index.html` をブラウザで開きます。
4. Vercelに置く場合は、このフォルダをGitHubに上げてVercelでデプロイします。

## 注意

この版はフロントエンドからSupabaseへ直接書き込みます。
既存の在庫管理シートと同じ運用に近いですが、公開URLにする場合はRLS設計をあとで絞るのがおすすめです。

公開URL:
https://rental-rim-app.vercel.app
