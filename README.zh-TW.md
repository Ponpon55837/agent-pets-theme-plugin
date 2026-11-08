# Agent Pets 面板主題合集

[English](README.md)

這是 [Agent Pets](https://github.com/Ponpon55837/agent-pets) 的純資料插件，用來改變面板與寵物視窗的外觀：文字、表面、強調色與狀態色、圓角、字型與字級、面板背景（純色、漸層或插件內附的圖片），以及寵物下方的狀態膠囊。每個主題都有淺色與深色兩組設定，App 會跟著系統或 Agent Pets 的外觀設定自動切換。部分主題也可以換上你自己的背景圖。

插件本身沒有程式碼：沒有 Worker、不需要任何權限、不連網。所有顏色與檔案都由 Agent Pets 驗證，樣式也由 App 自己產生。主題會套用到每個介面，包含權限與風險提示；App 只接受讓每個標籤在它可能出現的每個表面上都清楚、且危險／成功／警告／資訊色維持原本色相的主題。

## 主題

目前還沒有截圖，以下用文字說明每個主題。

| 主題 | 淺色 | 深色 | 自訂背景圖 | 字型與造型 |
|---|---|---|---|---|
| **櫻花** | 粉色水彩暈染，右上角有櫻花，上面蓋一層淡粉色遮罩 | 深梅色線性漸層 | 淺色、深色皆可 | 圓體標題，圓角 8/14/24 |
| **北境霜藍** | 雪灰色純色背景，霜藍色強調 | 極夜藍灰，頂端有柔和的放射狀光暈 | 不可 | 系統字型，圓角 6/10/16 |
| **抹茶和紙** | 重複鋪排的米色和紙紋理，帶纖維 | 深抹茶綠純色 | 不可 | 襯線標題，字級放大 5%，圓角 4/8/12 |
| **午夜終端機** | 高對比白紙，深青綠色強調 | 近黑色垂直漸層，亮青綠色強調 | 僅深色 | 等寬標題，圓角 2/4/8 |
| **沙丘暮色** | 夕陽天空與層層沙丘，蓋一層暖色遮罩 | 星空、彎月與紫色沙丘 | 淺色、深色皆可 | Avenir Next／Segoe UI 標題，字級放大 2%，圓角 10/16/26 |

每個模式都通過 1.12.0 完整的對比檢查，也都設定了自己的寵物狀態膠囊顏色。`npm run validate` 會列出每個模式的背景、宣告的圖片遮罩與自訂背景圖淡化值（並附上計算出的最小值），以及膠囊是否使用主題色。

## 需求

- Agent Pets **1.12.0 以上**。線上目錄項目設定 `"minAppVersion": "1.12.0"`，較舊的 App 不會列出這個插件；在較舊的 App 安裝或從資料夾載入會出現「插件封裝或 manifest 無效。」
- Node.js 22.18 以上，只有驗證、打包或簽章時需要（內附的 App 驗證器是 TypeScript，透過 Node 內建的型別移除執行）。沒有任何 npm 相依套件。

## 安裝

### 從線上目錄

1. 在 Agent Pets 開啟 **設定 → 插件 → 探索**。
2. 找到 **面板主題合集**，選 **安裝**，看過同意內容（「提供 5 個面板主題」）後選 **同意並安裝**。
3. 在 **已安裝** 分頁啟用插件。

### 從這個資料夾（開發者模式）

1. Clone 這個 repo。
2. 在 Agent Pets 開啟 **設定 → 插件 → 進階**，打開 **開發者模式**。
3. 打開 **安裝插件…**，選 **從資料夾載入…**，選擇 `src/` 資料夾（裡面有 `plugin.json`）。
4. 確認同意內容後安裝並啟用。修改 `src/` 存檔後約半秒會自動重新載入。

### 選擇主題

啟用插件後，面板會在 **工作階段**、**額度**、**歷史** 之後多一個這個插件的分頁。分頁中的 **面板主題** 區塊列出五個主題，每個都有淺色與深色預覽（含寵物狀態膠囊）。**設定 → 插件 → 面板主題合集 → 面板主題** 也有同一份清單。

- 按 **用於淺色模式**、**用於深色模式** 或 **兩種模式都使用** 套用主題。整個 App 每種模式只有一個主題，套用新的會取代目前的主題。使用中的卡片會顯示 **使用中 · 淺色** 或 **使用中 · 深色**。
- **恢復內建外觀** 讓兩種模式都回到預設外觀。
- **設定 → 通用 → 外觀 → 面板主題** 顯示每種模式目前使用的主題，並有 **自訂…**、**開啟插件設定** 與 **恢復內建外觀**。

允許自訂背景圖的主題（櫻花與沙丘暮色的兩種模式、午夜終端機的深色模式），在該模式使用中時，卡片會顯示 **選擇圖片…**、**移除圖片**、**填滿方式**、**位置**、**淡化** 與 **模糊**。Agent Pets 會檢查圖片（PNG、JPEG 或 WebP，每邊 64 到 8192 px、最大 20 MB，不可為動畫），並把副本存到自己的資料夾。插件看不到圖片也不知道路徑；移除插件時圖片會一併刪除。**淡化** 不會低於讓文字保持清楚的最小值。

### 我的主題

**自訂…** 會開啟主題編輯器。**起點** 可以選這裡的任何一個主題；複本會保留顏色、漸層、圓角、寵物膠囊顏色與背景圖設定，但不包含插件內附的背景圖（我的主題使用你自己的圖片）。儲存的複本列在 **我的主題**（在外觀頁，以及插件分頁的主題清單下方），以相同規則檢查，插件更新時也不會改變。

## 打包、簽章與驗證

```sh
npm test                 # 驗證器、壓縮檔與簽章的 node:test 測試
npm run validate         # 檢查 src/ 並列出每個主題的對比摘要
npm run build            # 未簽章的套件：dist/unsigned/panel-theme-collection-<version>.agentpet-plugin
npm run verify -- [--require-signature] [--fingerprint <hex>] [--sha256 <hex>] <套件路徑>   # 只能指定一個套件路徑；選項位置不限
npm run sync-rules       # 依 vendor.json 檢查內附的驗證器
```

`verify` 會以與 App 相同的 ZIP、套件與簽章規則重新讀取套件。`--require-signature` 讓未簽章的套件失敗，`--fingerprint` 要求套件由該金鑰簽章，`--sha256` 要求套件位元組的雜湊相符（也就是線上目錄項目裡的值）。

`npm run validate` 執行的就是 App 自己的驗證器：只有在 Agent Pets 會拒絕這個套件時才以錯誤結束。第一行是 App 在開發者模式顯示的診斷訊息，之後依 App 的檢查順序列出其餘所有問題（也就是主題編輯器顯示的清單），例如：

```text
error: sakura.light.background.overlay.opacity: 0.5 < minimum 0.81; text 3.75:1 < 4.5:1 on black image pixel
error: nord-frost.dark.colors.dangerText: 3.97:1 < 4.5:1 on dangerText at 0.12 over surface2 (state chip)
```

#### 讓規則與 App 保持一致

`scripts/lib/rules/app/` 是 App 的 `electron/plugin-panel-themes.ts`、`panel-theme-color.ts` 與 `pet-sprite-validation.ts` 逐位元組的複本。`scripts/lib/rules/vendor.json` 記錄所固定的 App commit 與每個檔案的 SHA-256；複本被修改過時 `npm test` 會失敗。

```sh
npm run sync-rules -- --app <agent-pets checkout> --check        # 與固定的 commit 比對
npm run sync-rules -- --app <agent-pets checkout> --commit <rev>  # 從 <rev> 複製並重新固定
AGENT_PETS_APP_DIR=<agent-pets checkout> npm test                 # 測試時也一併比對，並用 App 自己的程式檢查套件、簽章與目錄項目
```

檔案以 `git show <commit>:<path>` 讀取，所以 checkout 中尚未 commit 的修改永遠不會被複製。

### 簽章

發佈者金鑰是 PKCS#8 PEM 格式的 Ed25519 私鑰，必須是權限 0600 的一般檔案（不可是符號連結），放在這個 repo 以及任何 git 工作目錄之外；`sign` 會拒絕其他情況，也不會印出或複製金鑰，`.gitignore` 也排除了 `*.pem`、`keys/`、`signature.json`、`.env*` 與 `dist/`。

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
2. 執行 `npm test && npm run sign`，再執行 `npm run verify -- --fingerprint <你的金鑰指紋> dist/<套件>`。
3. 執行 `npm run catalog-entry -- dist/<套件>`，在線上目錄 repo 開 pull request：套件放在 `packages/`，印出的項目（含 `"minAppVersion": "1.12.0"`）加進 `index.json`。

## 新增主題

1. 在 `src/plugin.json` 的 `contributes.panelThemes` 新增一個物件（最多 8 個主題）。使用新的 `id`（`a-z`、`0-9`、`-`），`displayName` 要有 `zh-TW` 與 `en-US`（最多 48 字），`description` 可選（最多 120 字）。
2. 同時提供 `modes.light` 與 `modes.dark`。每個模式需要 10 個必要顏色：`bg`、`surface`、`surface2`、`text`、`textSecondary`、`textMuted`、`accent`、`accentText`、`onAccent`、`border`。選填顏色沒寫時會使用該模式的內建值（`dangerText`、`successText`、`warnText`、`infoText`、`scrim`、`shadow`、`highlight` 與 `sage` 系列），或由必要顏色推導。`borderOnAccent` 仍可寫，但會被忽略。
   - 顏色可用 `#hex`、`rgb()`、`rgba()`、`hsl()`、`hsla()` 或在 sRGB 色域內的 `oklch()`。不可用顏色名稱、`var()`、`calc()` 或 `url()`。
   - 文字與表面顏色必須不透明。淺色模式：`bg` 亮度至少 0.45，文字要比 `bg` 暗。深色模式：`bg` 亮度最多 0.12，文字要比 `bg` 亮。
   - 狀態色要維持色相（OKLCH）：危險 0–50° 或 340–360°、成功 105–170°、警告 55–105°、資訊 200–290°，色度至少 0.05，彼此的 OKLab ΔE 至少 0.08、與 `accent` 至少 0.06。`shadow` 亮度最多 0.05，`highlight` 至少 0.7。
   - 每個文字色都會在它可能出現的每個表面上檢查，包含 12% 的狀態色晶片，以及寵物泡泡、狀態膠囊與寵物視窗的選單（半透明的 `surface` 疊在黑色與白色桌面上）。最常見的失敗是深色模式的 `surface` 偏亮、狀態色又偏淡；驗證器會指出是哪一組。
3. 每個模式選一種 `background`：`{ "type": "solid" }`（預設）、`gradient`（`linear` 搭配 `angle`，或 `radial` 搭配 `position`；2 到 5 個不透明色標），或 `image` 搭配 `overlay` `{ color, opacity }`，opacity 介於 0.50 與 0.95。驗證器會印出讓所有文字在任何圖片像素上都清楚的最小遮罩值。
4. 要讓使用者換背景圖，在模式中加上 `"userImage": { "allowed": true, "overlay": { "color": …, "opacity": … } }`，遮罩規則相同。
5. 每個模式可選的 `petStatus`（寵物狀態膠囊）：`background`（alpha 0.85–1）與 `text` 必填，`border`、`textMuted`、`quotaFill`、`quotaTrack`、`quotaWarn` 選填。疊在黑色與白色桌面上時，文字要達 4.5:1，額度顏色在膠囊與額度軌道上要達 3:1。沒寫的 `quotaFill` 會用該模式的 `accent`，在軌道上常常太淡，建議自行指定。
6. 兩個模式共用的選填設定：`typography.body` 與 `typography.heading`（1 到 5 個字型名稱，最後一個必須是通用字族，如 `sans-serif`、`serif`、`monospace`、`system-ui`、`ui-serif`、`ui-rounded`、`ui-monospace`；中文字型要放在通用字族之前）、`typography.scale`（0.92 到 1.15，最多 2 位小數），以及 `shape` 圓角（`radiusSm` ≤ `radiusMd` ≤ `radiusLg`，上限 16/24/32）。
7. 圖片放在 `src/backgrounds/`，格式為 PNG 或 WebP：最大 8 MiB、每邊 64 到 4096 px、最多 839 萬像素、不可為動畫、不可有 EXIF 旋轉。字型放在 `src/fonts/`，格式為 WOFF2（每檔最多 1 MiB，每個主題最多 4 個字面），必須在主題的 `fonts` 宣告並以 `@id` 引用。只能內附 OFL 授權的字型，授權檔放在 `FONT-LICENSES/`，並記錄在 `src/licenses.json` 與 `CREDITS.md`。
8. 執行 `npm run validate` 直到沒有錯誤，再執行 `npm test`。

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
  validate.mjs build.mjs sign.mjs verify.mjs catalog-entry.mjs keygen.mjs sync-rules.mjs
  assets/generate.mjs    程式繪製的素材
  lib/rules/app/         原封不動複製的 App 驗證器（固定於 lib/rules/vendor.json）
  lib/rules/             內附驗證器的轉接層
  lib/                   圖片、套件規則、ZIP、簽章、目錄項目
tests/                   node:test
```

## 授權

MIT，見 [LICENSE](LICENSE)。素材來源列在 [CREDITS.md](CREDITS.md)。
