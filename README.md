# 數迴 Slitherlink

在固定 7×7 的棋盤上畫出一條不分岔的封閉迴路。簡單、中等、困難各有 30 關，可以直接選關。遊戲在瀏覽器執行，每台裝置的進度分別存在該裝置的瀏覽器。

## Cloudflare 公開版

任何人都可以免費開啟 [數迴遊戲](https://slitherlink.b04605078123.workers.dev/)。遊戲由 Cloudflare 直接提供 `public/` 的靜態檔案，不需要登入、綁定付款方式或讓 Mac 開機。靜態檔案請求不占用 Workers Free 的每日程式執行額度。 [Cloudflare 靜態資源計費](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/#billing)

進度與最佳時間儲存在各自的瀏覽器。遊戲檔案包含題目與解答，任何訪客都可以讀取。

### CI/CD

[GitHub 私人儲存庫](https://github.com/HungHsunHan/slitherlink) 已連接 Cloudflare Workers Builds。正式部署分支是 `main`，專案根目錄是 `/`，預覽建置已關閉。

| 設定 | 值 |
| --- | --- |
| Build command | `npm test` |
| Deploy command | `npm exec --yes --package=wrangler@4.166.0 -- wrangler deploy` |

每次推送到 `main` 都會先執行測試，通過才會部署。可到 Cloudflare 的 `slitherlink` Worker 的 **Deployments** 查看建置紀錄，也可在 GitHub 的提交頁面查看檢查結果。

### 手動部署

先用 Wrangler 登入具備部署權限的 Cloudflare 帳戶，再測試並部署。

```sh
npm exec --yes --package=wrangler@4.166.0 -- wrangler login --scopes account:read user:read workers:write workers_scripts:write
npm test
npm exec --yes --package=wrangler@4.166.0 -- wrangler deploy
```

## 手動啟動家庭 Wi-Fi 版

在 Mac 安裝 Node.js 22 以上，然後在這個專案資料夾開啟「終端機」。遊戲無額外套件。每次要開放給家人玩時，執行下列指令。

```sh
npm run start:lan
```

終端機會顯示這台 Mac 的 Wi-Fi 遊戲網址，例如 `http://192.168.1.20:8787/`。將**終端機顯示的實際網址**分享給家人，請他們連上相同的家庭 Wi-Fi，再用手機、平板或電腦的瀏覽器開啟。

伺服器只綁定這台電腦的指定私有 IPv4 位址，並接受同一子網路的裝置。遊戲資料由這台電腦提供，不需要上傳到雲端或在路由器設定連接埠轉送。玩遊戲時請讓 Mac 保持開機、清醒並連著 Wi-Fi，並讓啟動遊戲的終端機保持開啟。在該終端機按 `Ctrl+C` 即可停止服務。

### 手動選擇 IP 或連接埠

若無法自動辨識 Wi-Fi，在 macOS「系統設定 → Wi-Fi → 詳細資訊 → TCP/IP」查看這台 Mac 的 IPv4 位址。把下面指令的範例位址換成該位址。`--port` 可省略，預設為 `8787`：

```sh
npm run start:lan -- --host 192.168.1.20 --port 8787
```

若只想在自己的電腦玩，執行 `npm start`，然後開啟 `http://127.0.0.1:8787/`。

### 家人的裝置連不上時

- 確認 Mac 和家人的裝置使用同一個家庭網路，有些訪客 Wi-Fi 會隔離裝置。
- 若安裝了多個 Node 版本，執行 `node -p 'process.execPath'` 可查出實際執行檔。若預設版本的入站連線已被防火牆擋下，請使用這台 Mac 上已可接收入站連線的 Node 版本。
- 如果 Mac 的 Wi-Fi IP 改變，重啟遊戲伺服器並分享新的網址。希望網址固定時，可在家中路由器替這台 Mac 保留 DHCP 位址。

## 玩法

- 數字代表該格四邊必須畫上的線段數。空白格沒有這項限制。整盤的所有線段須連成一條封閉迴路。
- 在棋盤選擇畫線或叉號工具，然後點按邊線套用。滑鼠也可用右鍵切換叉號。
- 第一次動作開始計時。切離頁面、查看解答或完成關卡時，計時暫停。
- 可復原上一步、重新開始目前關卡，或開啟解答。查看解答會保留原本的作答進度，回到棋盤即可繼續。
- 解題成功時會顯示完成結果卡，記錄本次用時與完成的棋盤。關閉後可從棋盤下方再次查看。

## 測試

```sh
npm test
```
