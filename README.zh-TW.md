# Agent Pets 面板主題合集

[English](README.md)

這是 [Agent Pets](https://github.com/Ponpon55837/agent-pets) 的純資料插件，用來改變設定／狀態面板的外觀：文字、表面、強調色與狀態色、圓角、字型與字級，以及面板背景（純色、漸層或插件內附的圖片）。每個主題都有淺色與深色兩組設定，面板會跟著系統或 Agent Pets 的外觀設定自動切換。部分主題也可以換上你自己的背景圖。

插件本身沒有程式碼：沒有 Worker、不需要任何權限、不連網。所有顏色與檔案都由 Agent Pets 驗證，樣式也由 App 自己產生。權限提示、插件安裝確認等受保護區域永遠維持內建外觀。

## 主題

目前還沒有截圖，以下用文字說明每個主題。

| 主題 | 淺色 | 深色 | 自訂背景圖 | 字型與造型 |
|---|---|---|---|---|
| **櫻花** | 粉色水彩暈染，右上角有櫻花，上面蓋一層淡粉色遮罩 | 深梅色線性漸層 | 淺色、深色皆可 | 圓體標題，圓角 8/14/24 |
| **北境霜藍** | 雪灰色純色背景，霜藍色強調 | 極夜藍灰，頂端有柔和的放射狀光暈 | 不可 | 系統字型，圓角 6/10/16 |
| **抹茶和紙** | 重複鋪排的米色和紙紋理，帶纖維 | 深抹茶綠純色 | 不可 | 襯線標題，字級放大 5%，圓角 4/8/12 |
| **午夜終端機** | 高對比白紙，深青綠色強調 | 近黑色垂直漸層，亮青綠色強調 | 僅深色 | 等寬標題，圓角 2/4/8 |
| **沙丘暮色** | 夕陽天空與層層沙丘，蓋一層暖色遮罩 | 星空、彎月與紫色沙丘 | 淺色、深色皆可 | Avenir Next／Segoe UI 標題，字級放大 2%，圓角 10/16/26 |

`npm run validate` 檢查出的對比（每個模式所有可能出現的背景中，最低的文字對比與最低的強調色／UI 對比；圖片背景會以遮罩下最暗與最亮的像素計算）：

| 主題 | 淺色：文字／UI | 深色：文字／UI |
|---|---|---|
| 櫻花 | 5.08 / 3.30 | 5.02 / 3.67 |
| 北境霜藍 | 4.78 / 3.50 | 4.94 / 5.03 |
| 抹茶和紙 | 4.79 / 3.33 | 6.39 / 7.43 |
| 午夜終端機 | 5.82 / 5.09 | 5.18 / 6.84 |
| 沙丘暮色 | 4.66 / 3.35 | 5.04 / 3.77 |

最低要求：文字 4.5:1，強調色與其他 UI 顏色 3:1。

## 需求

- Agent Pets **1.12.0 以上**。較舊的版本不認得 `panelThemes`：線上目錄不會對它們顯示這個插件，從資料夾載入則會出現 manifest 無效的錯誤。
- Node.js 22 以上，只有驗證、打包或簽章時需要。沒有任何 npm 相依套件。

## 安裝

### 從線上目錄

1. 在 Agent Pets 開啟 **設定 → 整合與進階 → 插件 → 探索**。
2. 找到 **面板主題合集**，選 **安裝**，確認同意內容（「提供 5 個面板主題」）。
3. 在 **已安裝** 分頁啟用插件。

### 從這個資料夾（開發者模式）

1. Clone 這個 repo。
2. 在 Agent Pets 開啟 **設定 → 整合與進階 → 插件 → 進階**，打開 **開發者模式**。
3. 打開安裝選單，選 **從資料夾載入…**，選擇 `src/` 資料夾（裡面有 `plugin.json`）。
4. 確認同意內容後安裝並啟用。修改 `src/` 存檔後約半秒會自動重新載入。

### 選擇主題

開啟 **設定 → 通用 → 外觀 → 面板主題**。分別為 **淺色模式** 與 **深色模式** 選主題（兩者可以不同），看過兩個預覽後按 **套用**。**還原內建** 隨時可以回到預設外觀。

允許自訂背景圖的主題，同一張卡片會顯示該模式的 **選擇圖片…**。Agent Pets 會開啟檔案對話框、檢查圖片（PNG、JPEG 或 WebP，最大 20 MiB、每邊 8192 px，不可為動畫），並把副本存到自己的資料夾。可以調整填滿方式、位置、變暗程度與模糊。插件看不到圖片也不知道路徑；移除插件時圖片會一併刪除。

## 打包、簽章與驗證

```sh
npm test                 # 驗證器、壓縮檔與簽章的 node:test 測試
npm run validate         # 檢查 src/ 並列出每個主題的對比摘要
npm run build            # 未簽章的套件：dist/unsigned/panel-theme-collection-<version>.agentpet-plugin
npm run verify -- <套件路徑> [--require-signature]   # 只能指定一個套件路徑
```

只要有 App 會拒絕的問題，`npm run validate` 就會以錯誤結束，例如：

```text
error: contributes.panelThemes[sakura].modes.light.colors.textMuted: 4.05:1 < 4.5:1 on darkest image pixel
error: contributes.panelThemes[sakura].modes.light.background.overlay.opacity: 0.82 is below the minimum 0.87
```

### 簽章

發佈者金鑰是 PKCS#8 PEM 格式的 Ed25519 私鑰，必須放在這個 repo 以及任何 git 工作目錄之外；腳本會拒絕其他位置，`.gitignore` 也排除了 `*.pem`、`keys/`、`signature.json`、`.env*` 與 `dist/`。

```sh
# 只做一次：建立金鑰（不會覆寫既有檔案；權限 0600）
npm run keygen -- --out ~/.agent-pets/keys/panel-theme-collection.ed25519.pem

# 每次發佈：驗證、簽章並寫出 dist/panel-theme-collection-<version>.agentpet-plugin
AGENT_PETS_SIGNING_KEY=~/.agent-pets/keys/panel-theme-collection.ed25519.pem npm run sign
# 或
npm run sign -- --key ~/.agent-pets/keys/panel-theme-collection.ed25519.pem

# 印出線上目錄 index 項目（size、sha256、publicKeyFingerprint、minAppVersion 1.12.0）
npm run catalog-entry -- dist/panel-theme-collection-<version>.agentpet-plugin   # 只能指定一個套件路徑
```

`sign` 會依照 Agent Pets 簽章文件，在套件根目錄加入 `signature.json`（對其他所有檔案排序後的 `路徑<TAB>sha256` 逐行內容做 Ed25519 簽章），並印出套件大小、SHA-256 與金鑰指紋。`src/` 不會被修改。請把金鑰離線備份；遺失時，使用者必須確認新的指紋。

套件是可重現的：檔案依路徑排序、不壓縮直接儲存、時間固定為 1980-01-01，所以相同的 `src/` 永遠產生相同的位元組。

### 發佈

1. 調高 `src/plugin.json` 的 `version`。已發佈的版本不會被覆蓋。
2. 執行 `npm test && npm run sign`，再執行 `npm run verify -- dist/<套件> --require-signature`。
3. 執行 `npm run catalog-entry -- dist/<套件>`，在線上目錄 repo 開 pull request：套件放在 `packages/`，印出的項目加進 `index.json`。

## 新增主題

1. 在 `src/plugin.json` 的 `contributes.panelThemes` 新增一個物件（最多 8 個主題）。使用新的 `id`（`a-z`、`0-9`、`-`），`displayName` 要有 `zh-TW` 與 `en-US`（最多 48 字），`description` 可選（最多 120 字）。
2. 同時提供 `modes.light` 與 `modes.dark`。每個模式需要 10 個必要顏色：`bg`、`surface`、`surface2`、`text`、`textSecondary`、`textMuted`、`accent`、`accentText`、`onAccent`、`border`。選填顏色（例如 `dangerText`、`successText`、`warnText`、`sage`）沒寫時用內建值，其他的會自動推導。
   - 顏色可用 `#hex`、`rgb()`、`rgba()`、`hsl()`、`hsla()` 或在 sRGB 色域內的 `oklch()`。不可用顏色名稱、`var()`、`calc()` 或 `url()`。
   - 文字與表面顏色必須不透明。淺色模式：`bg` 亮度至少 0.45，文字要比 `bg` 暗。深色模式：`bg` 亮度最多 0.12，文字要比 `bg` 亮。
3. 每個模式選一種 `background`：`{ "type": "solid" }`（預設）、`gradient`（`linear` 搭配 `angle`，或 `radial` 搭配 `position`；2 到 5 個不透明色標），或 `image` 搭配 `overlay` `{ color, opacity }`，opacity 介於 0.50 與 0.95。驗證器會印出讓所有文字在任何圖片像素上都清楚的最小遮罩值。
4. 要讓使用者換背景圖，在模式中加上 `"userImage": { "allowed": true, "overlay": { "color": …, "opacity": … } }`，遮罩規則相同。
5. 兩個模式共用的選填設定：`typography.body` 與 `typography.heading`（1 到 5 個字型名稱，最後一個必須是通用字族，如 `sans-serif`、`serif`、`monospace`、`system-ui`、`ui-serif`、`ui-rounded`、`ui-monospace`；中文字型要放在通用字族之前）、`typography.scale`（0.92 到 1.15，最多 2 位小數），以及 `shape` 圓角（`radiusSm` ≤ `radiusMd` ≤ `radiusLg`，上限 16/24/32）。
6. 圖片放在 `src/backgrounds/`，格式為 PNG 或 WebP：最大 8 MiB、每邊 64 到 4096 px、最多 839 萬像素、不可為動畫、不可有 EXIF 旋轉。字型放在 `src/fonts/`，格式為 WOFF2（每檔最多 1 MiB，每個主題最多 4 個字面），必須在主題的 `fonts` 宣告並以 `@id` 引用。只能內附 OFL 授權的字型，授權檔放在 `FONT-LICENSES/`，並記錄在 `src/licenses.json` 與 `CREDITS.md`。
7. 執行 `npm run validate` 直到沒有錯誤，再執行 `npm test`。

套件只能包含 `.json`、`.png`、`.webp` 與 `.woff2` 檔案，最多 64 個檔案、25 MiB。`src/` 裡的其他檔案（包括 `.DS_Store` 這類系統自動產生的檔案）都會讓驗證失敗，請刪除。

`npm run assets` 會用程式重新繪製內附的背景圖與圖示（需要 libwebp 的 `cwebp`）。

## Repo 結構

```text
src/                     套件根目錄（開發者模式載入這個資料夾）
  plugin.json            manifest：無 Worker，contributes.panelThemes
  licenses.json          隨套件附上的素材與字型授權
  assets/icon.png
  backgrounds/*.webp
scripts/
  validate.mjs build.mjs sign.mjs verify.mjs catalog-entry.mjs keygen.mjs
  assets/generate.mjs    程式繪製的素材
  lib/rules/             顏色語法、推導與對比規則
  lib/                   圖片、套件規則、ZIP、簽章
tests/                   node:test
```

## 授權

MIT，見 [LICENSE](LICENSE)。素材來源列在 [CREDITS.md](CREDITS.md)。
