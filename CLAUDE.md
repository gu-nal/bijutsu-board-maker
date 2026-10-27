# 美術資料メーカー

撮影用の「美術資料」（ベース写真＋天板・お皿・クロスなどの参考写真を並べたA4資料）を作るブラウザーアプリ。
公開URL: https://gu-nal.github.io/bijutsu-board-maker/ （GitHub Pages、リポジトリ gu-nal/bijutsu-board-maker）
元は Codex で作成し、ChatGPT Sites（https://bijutsu-board-maker.activedegu.chatgpt.site/ ）で公開していたもの。

## 構成

- `src/index.html` … 画面のHTML
- `src/styles.css` … 画面と印刷（PDF書き出し）のスタイル
- `src/app.js` … ロジック全体（保存・検索・レイアウト・プレビュー）
- `scripts/build.mjs` … 上の3つを1ファイルに結合して `dist/index.html` を出力する
- `dist/index.html` … 公開用の単一HTML（**直接編集しない**。必ず `src/` を直してビルドする）
- `.github/workflows/pages.yml` … main に push するとビルドして GitHub Pages へ公開する
- `.openai/hosting.json` … 旧公開先 ChatGPT Sites のプロジェクト設定（公開ディレクトリは `dist`）

## 更新の手順

1. `src/` のファイルを編集する
2. `npm run build` で `dist/index.html` を再生成する
3. `dist/index.html` をブラウザーで開いて確認する
4. `src/` と `dist/` を両方コミットする
5. `git push github HEAD:main` で公開（GitHub Actions が数十秒〜1分で反映）

外部ライブラリは使っていない（ビルドは Node 標準機能のみ）。

## データ保存

- ブラウザーの IndexedDB（DB名 `bijutsu-board-db`、ストア `projects`）に保存。サーバーには送らない。
- 公開URL（オリジン）が変わると保存データは引き継がれない。移行時は画面の「バックアップ」でJSONを書き出し、新しいURLで読み込む。
- 保存データの形（`state`）を変えるときは、`migrateSections()` / `ensureSceneGroups()` のように古いデータを読み込めるよう移行処理を入れる。

## 主な仕様（Codexでの決定事項）

- ベース写真は各カットの最初のページに大きく配置。表紙はブランドロゴ画像（コピー＆ペースト可）とタイトル、アクセントカラーの線を中央に置く。
- ページ上部のアクセントカラーの線は見出し文字にギリギリ近い位置まで上げる。
- 参考写真は等間隔で綺麗に並べる。1段目・2段目…ごとに何枚入れるかを指定でき、枚数が少ないほど大きく表示される（`layoutMosaicGrid`）。
- カテゴリ（天板・お皿・クロスなど）はページ内に詰めて配置し、収まらない分は次のページへ送る。各カットのベースイメージの下に、そのカットの「天板」が続く。
- 見出し（ベースイメージ・天板・お皿・クロス等）は設定中の見出しサイズで統一する。
- 写真検索: Pinterest / Google / Adobe Stock は検索リンクを開く方式。アプリ内で候補を出してポチポチ追加できるのは Wikimedia Commons と Openverse（APIキー不要）。
- 過去に作った資料はライブラリにストックし、開く・コピーして再利用・削除ができる。
- 入力は「1 案件の基本情報」「2 撮影カット詳細」の2段。撮影カットは何個でも追加でき、カットごとにベース写真＋参考写真カテゴリ（天板・お皿・クロスなど）を持つ（2026-10-27 に旧「2 ベース写真」「3 シーン別の参考写真」を統合）。
- データ上はカット＝`state.sceneGroups[]`（`{ id, title, base }`）。カテゴリは `sections[].sceneGroupId` でカットに属する。旧データの共通 `state.base` は `ensureSceneGroups()` で1カット目へ移す。
- 資料はカットごとに「ベースイメージ（＋そのカットの天板）のページ → 残りのカテゴリのページ」の順。ページ上部の見出しは「料理名 ｜ カット名」。

## 動画

- 各カテゴリに写真と同じ扱いで動画を入れられる（「写真・動画を選ぶ」／ドロップ／「URL追加」）。
- 写真データに `kind: "video"` を付け、`src` には代表コマ（動画の約1秒地点を切り出したJPEG）を入れる。レイアウト・ページ送りは写真とまったく同じロジックで動く。
- 動画ファイル本体は IndexedDB の `media:<mediaId>` に Blob で保存（`state` には入れない。JSON化で壊れるため）。
- URL動画（YouTube・Vimeo・Instagramリール・TikTok・mp4等の直リンク）は `videoUrl` を持つ。YouTubeはサムネイル画像、他は代替画像を表示。
- 資料上は▶バッジ（クリックで再生モーダル）。PDFでは再生できないので代表コマ＋▶表示になり、URL動画は「動画を見る ↗」リンクがPDF上でもクリックできる。
- バックアップJSONには `media`（mediaId → データURL）として動画本体を同梱し、読み込み時に IndexedDB へ戻す。
