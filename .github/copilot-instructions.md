# Quy ước UI/UX cho WeatherBot (GitHub Copilot)

Đặt file này tại `.github/copilot-instructions.md`.

## 0. Tóm tắt nhanh (đọc phần này trước)

1. **`design/weatherbot.html` là bản thiết kế tham chiếu**, không phải file chạy thật. Muốn làm giao diện nào, mở file này, tìm thành phần tương tự, rồi chép markup và class sang view. Không sửa file này trừ khi được yêu cầu cập nhật thiết kế.
2. **View chạy thật dùng master layout**. Master layout đã nhúng Bootstrap, Bootstrap Icons, font và header. View **không** được khai báo lại `<html>`, `<head>`, `<link>` hay `<script>` của các thư viện này.
3. **CSS nằm trong file dùng chung** (`public/css/`), **JS nằm trong file riêng** (`public/js/`). Không viết `<style>` hoặc `<script>` dài trong view.
4. Giao diện là **glassmorphism**: nền gradient tím-hồng, khối kính mờ `.glass`, chữ trắng, pill cho nút/input. Chỉ dùng màu và bo góc trong bảng token (mục 4).
5. Dữ liệu lấy từ `POST /ai/chat`. Card dựng từ `data.weatherCards`, chọn renderer theo `card.type`. Không bịa số liệu thời tiết ở frontend (mục 6).
6. Mọi chuỗi động đưa vào HTML phải qua `esc()`.

---

## 1. Cấu trúc file

Đường dẫn dưới đây là quy ước đề xuất. **Nếu project đang dùng tên thư mục khác thì giữ theo project**, chỉ giữ nguyên vai trò của từng file.

```
design/
  weatherbot.html          Thiết kế mẫu (chỉ để tham chiếu, chứa dữ liệu mock)
views/
  layouts/main.ejs         Master layout: head, thư viện, header, khung <main>, slot nội dung
  partials/header.ejs      Navbar glass (nếu tách riêng)
  chat.ejs                 View trang chat: tab mobile + lưới 2 panel
public/
  css/app.css              Token, nền, .glass, form, nút, chip, card, animation
  css/chat.css             (tuỳ chọn) CSS riêng của trang chat: bong bóng, tab mobile, forecast-row...
  js/common.js             $, esc, timeNow, iconTone, DAY_NAMES
  js/cards.js              cardShell, renderWeatherCard, renderForecastCard, RENDERERS
  js/chat.js               Gửi tin nhắn, gọi API, cập nhật panel, tab mobile
  data/test-questions.json Câu hỏi test cho select (thay cho mảng TEST_QUESTIONS trong file mẫu)
```

> Cú pháp template trong tài liệu này viết theo **EJS** (`<%- body %>`). Nếu project dùng Handlebars, Pug hoặc engine khác, đổi cú pháp tương ứng và giữ nguyên cấu trúc.

Khi chuyển từ `design/weatherbot.html` sang project, ánh xạ như sau:

| Trong file mẫu | Chuyển đến |
| --- | --- |
| `<head>` (meta, link Bootstrap, Icons, font) | `layouts/main.ejs` |
| `<style>` mục Token, Nền, Kính mờ, Header, Khung chính, Form, Card | `public/css/app.css` |
| `<style>` mục Chat, tab mobile, forecast, news | `public/css/chat.css` (hoặc gộp vào `app.css` nếu dự án nhỏ) |
| `<header class="glass app-header">` | `partials/header.ejs`, gọi trong layout |
| `<main class="app-main">` và bên trong | phần khung `<main>` ở layout, nội dung con ở `chat.ejs` |
| `<script>` mục 3 (render card), mục 4 (chat) | `public/js/cards.js`, `public/js/chat.js` |
| `TEST_QUESTIONS` | `public/data/test-questions.json` |
| `CITIES`, `NEWS`, `mockChat`, `callChat` (mock) | **Không** đưa vào bản chạy thật |

---

## 2. Master layout và view

### 2.1 Layout sở hữu những gì

Layout là nơi **duy nhất** khai báo các mục sau. View không được lặp lại:

- `<!DOCTYPE html>`, `<html lang="vi">`, `<meta charset>`, `<meta viewport>` (có `viewport-fit=cover`)
- Bootstrap CSS **5.3.3**, Bootstrap Icons **1.11.3**, font **Be Vietnam Pro** (400/500/600/700)
- `public/css/app.css` (luôn nạp), CSS riêng của trang (nạp theo trang)
- Bootstrap JS bundle (đặt cuối `<body>`)
- Header glass và khung `<main class="app-main">`

Mẫu layout:

```ejs
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title><%= title %> | WeatherBot</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link href="/css/app.css" rel="stylesheet">
  <% if (typeof pageCss !== 'undefined') { %><link href="<%= pageCss %>" rel="stylesheet"><% } %>
</head>
<body class="<%= typeof bodyClass !== 'undefined' ? bodyClass : '' %>">
  <%- include('../partials/header', { active: typeof active !== 'undefined' ? active : '' }) %>
  <main class="app-main">
    <%- body %>
  </main>
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
```

Ghi chú cho Copilot:
- Menu đang chọn: server truyền biến `active` (ví dụ `'home'`, `'forecast'`, `'news'`); header gắn `active` và `aria-current="page"` cho link tương ứng. **Không** hardcode `active` trong markup.
- Đổi phiên bản Bootstrap, Icons hoặc font: chỉ sửa ở layout.
- `body` mặc định của thiết kế là `height: 100dvh; overflow: hidden` (app một màn hình, cuộn trong `.scroll-area`). Trang nào cần cuộn cả trang (ví dụ trang nội dung dài) thì thêm `bodyClass: 'page-scroll'` và trong `app.css` có `body.page-scroll { height: auto; overflow: auto; }`. Không xoá `overflow: hidden` mặc định.

### 2.2 View chỉ chứa nội dung của trang

`chat.ejs` chỉ gồm phần nằm trong `<main class="app-main">`: tab mobile và lưới hai panel. Cấu trúc bên trong giữ đúng như file mẫu:

```
.mobile-tabs.glass.d-md-none         (tab Chat / Kết quả, chỉ mobile)
.row.g-3.app-grid
  section.col-md-5.panel#panel-chat     → .glass.panel-inner (panel-head, scroll-area, panel-foot)
  section.col-md-7.panel#panel-results  → .glass.panel-inner (panel-head, scroll-area)
```

Cuối view nạp JS bằng module để chắc chắn chạy sau khi DOM và Bootstrap sẵn sàng:

```html
<script type="module" src="/js/chat.js"></script>
```

Cấu hình từ server (nếu cần, ví dụ model mặc định) truyền qua thuộc tính `data-*` trên phần tử gốc, không nhúng biến vào script inline.

### 2.3 Việc Copilot phải làm khi được yêu cầu "thêm trang/màn hình mới"

1. Tạo view mới chỉ chứa nội dung phần `<main>`, render qua master layout với `title`, `active` (và `pageCss`, `bodyClass` nếu cần).
2. Tìm thành phần tương tự trong `design/weatherbot.html`, dùng lại class có sẵn.
3. Thêm CSS mới vào file CSS dùng chung hoặc file CSS riêng của trang, không viết trong view.
4. Thêm JS mới vào `public/js/`, dùng lại `esc`, `cardShell` từ `common.js`/`cards.js`.
5. Thêm link vào `partials/header` nếu là trang điều hướng chính.

---

## 3. Stack cố định

- Bootstrap 5.3.3, Bootstrap Icons 1.11.3, font Be Vietnam Pro, JavaScript thuần (ES module, không build step).
- Không thêm React, Vue, Tailwind, jQuery hay thư viện UI/biểu đồ khác nếu chưa được duyệt.
- Ưu tiên class tiện ích của Bootstrap (`d-flex`, `gap-2`, `row`, `col-md-5`, `small`, `fw-semibold`, `visually-hidden`, `d-md-none`...) cho bố cục và khoảng cách. Chỉ viết CSS riêng khi Bootstrap không đáp ứng.
- Ngôn ngữ giao diện: **tiếng Việt**, giọng thân thiện và ngắn gọn.
- Mobile-first, chạy tốt từ 360px. Vùng dưới cùng luôn có `padding-bottom: max(12px, env(safe-area-inset-bottom))`.

---

## 4. Design token

Khai báo trong `public/css/app.css`. **Không hardcode lại** các giá trị này ở nơi khác.

```css
:root {
  --glass: rgba(255, 255, 255, .14);
  --glass-strong: rgba(255, 255, 255, .22);
  --glass-line: rgba(255, 255, 255, .30);
  --text-dim: rgba(255, 255, 255, .78);
  --sky: #7dd3fc;
  --violet: #c4b5fd;
  --radius-lg: 24px;
  --radius-md: 16px;
}
```

| Mục đích | Giá trị |
| --- | --- |
| Nền trang | `linear-gradient(135deg, #1e1b4b 0%, #4c1d95 55%, #9d174d 100%) fixed` |
| Quầng sáng nền | 2 blob `blur(90px)`, `opacity: .55`: `#38bdf8` (trên trái), `#f472b6` (dưới phải), dựng bằng `body::before/::after` |
| Gradient logo và nút gửi | `linear-gradient(135deg, #38bdf8, #a855f7)` |
| Chấm "Sẵn sàng" | `#34d399` |
| Chấm báo kết quả mới | `#f472b6` |
| Chữ | `#fff` kèm `text-shadow: 0 1px 2px rgba(0,0,0,.2)`; chữ phụ dùng `.dim` |
| Bo góc | Panel/card 24px, ô con 14 đến 16px, bong bóng 20px, nút/input pill (`999px`) |

Quy tắc:
- Mọi bề mặt là **trắng trong suốt** (`rgba(255,255,255,.06 … .26)`). Không dùng nền đen, xám hoặc trắng đặc.
- Không thêm màu nhấn mới ngoài bảng. Nếu bắt buộc, thêm biến CSS và ghi chú lý do.
- Không có dark/light toggle. Chỉ một theme.
- Không dùng emoji thay icon, dùng Bootstrap Icons.

---

## 5. Danh mục thành phần (dùng lại trước khi tạo mới)

| Class | Dùng cho | Ghi chú |
| --- | --- | --- |
| `.glass` | Header, panel, card, tab mobile | Bắt buộc có fallback `@supports not (backdrop-filter…)` với nền `rgba(30,27,75,.85)`. Không lồng `.glass` quá một tầng |
| `.panel-inner` / `.panel-head` / `.scroll-area` / `.panel-foot` | Khung panel | Cuộn nằm trong `.scroll-area`, thanh cuộn mảnh |
| `.glass-input` | `input`, `select` | Kết hợp `form-control` / `form-select`. `<option>` phải `color: #111` |
| `.btn-send` | Nút gửi tròn 46px | Icon `bi-send-fill`, có `aria-label` |
| `.btn-ghost` | Nút phụ (Xoá kết quả...) | Pill, `font-size: .85rem` |
| `.tool-chip` (`.running`) | Chip tên tool | Xanh lá khi xong, xanh dương khi đang chạy |
| `.bubble` trong `.msg.bot` / `.msg.user` | Tin nhắn chat | Bot bo góc dưới-trái 6px, user bo góc dưới-phải 6px, nền tím `rgba(167,139,250,.38)` |
| `.result-card.glass` | Card kết quả | Sinh bằng `cardShell()`, animation `rise` |
| `.stat` (`.stat-label`, `.stat-value`) | Ô số liệu nhỏ | Đặt trong `row row-cols-2 row-cols-xl-4 g-2` |
| `.forecast-row` + `.day` (`.today`) | Dải dự báo cuộn ngang | `scroll-snap`, mỗi ngày `flex: 1 0 96px` |
| `.temp`, `.wx-big`, `.wx-*` | Nhiệt độ lớn, icon lớn, màu icon | Xem mục 6.3 |
| `.news-list` / `.news-item` / `.news-ico` | Khung tin tức (dự phòng) | Backend chưa có tool này |
| `.empty` | Trạng thái rỗng | Icon `bi-cloud-sun` cỡ 2.5rem + câu hướng dẫn |
| `.mobile-tabs` / `.tab-btn` (`.active`, `.dot`) | Tab Chat/Kết quả trên mobile | `role="tablist"`, `role="tab"`, cập nhật `aria-selected` |

Hành vi bắt buộc:
- **Desktop (≥768px)**: hai cột, chat 5/12 và kết quả 7/12. **Mobile (<768px)**: hiện một panel một lúc qua tab; panel không `.active` thì `display: none`.
- Khi có card mới mà đang ở tab Chat trên mobile: hiện chấm hồng ở tab Kết quả; chuyển sang tab Kết quả thì ẩn.
- Gửi tin nhắn: hiện bong bóng bot có `spinner-border-sm` + "Đang xử lý…", khoá nút gửi, xong thì mở lại và `focus()` ô nhập. Vùng tin nhắn có `aria-live="polite"`.
- Card mới nằm **trên cùng** (`insertAdjacentHTML('afterbegin')`); trong cùng một lượt, card của tool gọi trước nằm trên cùng (duyệt mảng ngược).
- Select câu hỏi test chỉ **điền vào ô nhập**, không tự gửi.
- Lời chào đầu: "Chào bạn! Bạn muốn xem thời tiết ở đâu?"

---

## 6. Hợp đồng dữ liệu với backend

Endpoint: `POST /ai/chat`, body `{ "prompt": string, "model"?: string }`.
**Không** dùng `/api/chat`, `{ message }` hay `{ reply, toolCalls }` như trong mock của file thiết kế.

Response `200`:

```json
{
  "success": true,
  "message": "AI trả lời thành công.",
  "data": {
    "answer": "…",
    "weatherCards": [ /* card current hoặc forecast */ ],
    "calledFunctions": [ { "name": "get_weather_by_address", "arguments": { "address": "…" } } ]
  }
}
```

| Dữ liệu | Hiển thị |
| --- | --- |
| `data.answer` | Lời dẫn ngắn trong `.bubble`. Sau khi gọi tool, không lặp lại dữ liệu đã hiển thị trên card. Rỗng thì dùng "Mình chưa tìm được kết quả phù hợp. Bạn thử hỏi lại nhé." |
| `data.calledFunctions[].name` | `.tool-chip` phía trên bong bóng |
| `data.weatherCards[]` | Card ở panel Kết quả, chọn renderer theo `card.type` |

```js
export const RENDERERS = { current: renderWeatherCard, forecast: renderForecastCard };
```

Card có `type` không biết thì **bỏ qua**, không báo lỗi.

### 6.1 Card `current`

Trường: `location`, `icon`, `condition`, `meme`, `current.temperature|humidity|windSpeed` (mỗi cái `{ value, unit }`).

- Tiêu đề: `bi-geo-alt-fill` + `location`.
- `.temp` = `value` + `unit` của nhiệt độ; dòng `.dim` bên dưới là `condition`.
- Icon lớn `.wx-big` dùng nguyên chuỗi `icon`.
- Lưới `.stat` **chỉ** có Độ ẩm và Gió. Backend không trả cảm giác như, UV, áp suất, nên **không hiển thị và không bịa**. Chỉ thêm khi backend bổ sung trường.
- `meme` là bài thơ 4 câu, mỗi câu 7 tiếng; hiển thị trong ngoặc kép, chữ nghiêng và màu nhấn, giữ nguyên xuống dòng. Không đặt trong `.stat`.

### 6.2 Card `forecast`

Trường: `location`, `days[]` (tối đa 7) với `date` (`YYYY-MM-DD`), `icon`, `condition`, `temperatureMax`, `temperatureMin`, `rainProbability`.

- Tiêu đề: `bi-calendar3` + "Dự báo {days.length} ngày, {location}". Đếm theo số phần tử thực tế, không ghi cứng "5 ngày".
- Thân là `.forecast-row`; ngày đầu là `.day.today` với tên "Hôm nay". Các ngày sau lấy tên từ `date` qua `DAY_NAMES`. Parse `date` theo giờ địa phương (tách `YYYY-MM-DD` rồi tạo `new Date(y, m - 1, d)`), tránh lệch múi giờ.
- Nhiệt độ: `Math.round(max)° / Math.round(min)°`. Xác suất mưa: `.rain` = "Mưa {value}%".

### 6.3 Icon và màu icon

Backend trả sẵn class Bootstrap Icons đầy đủ, ví dụ `"bi bi-cloud-rain"`. Dùng thẳng, và thêm màu bằng `iconTone()`:

```html
<i class="${esc(card.icon)} ${iconTone(card.icon)}"></i>
```

`iconTone(iconClass)` kiểm tra theo thứ tự từ trên xuống:

| Tên icon chứa | Trả về |
| --- | --- |
| `lightning` | `wx-storm` |
| `rain`, `drizzle`, `snow` | `wx-rain` |
| `cloud-sun`, `cloud-moon` | `wx-partly` |
| `cloud` | `wx-cloud` |
| `sun` | `wx-sun` |
| khác | chuỗi rỗng (mặc định trắng) |

Không tự tạo bảng mã thời tiết sang icon ở frontend, vì `weatherCodeMap.json` phía backend đã làm việc đó.

### 6.4 Gọi API và xử lý lỗi

```js
export async function callChat(prompt, model) {
  const res = await fetch('/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(model ? { prompt, model } : { prompt })
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw new Error(json?.message || `HTTP ${res.status}`);
  return json.data; // { answer, weatherCards, calledFunctions }
}
```

- `400`, `502` và lỗi mạng: hiện bong bóng bot "Không lấy được dữ liệu. Kiểm tra kết nối rồi gửi lại nhé." Với `502` có thể nói riêng: "Trợ lý AI đang không phản hồi, bạn thử lại sau nhé."
- Không `alert()`, không hiện stack trace hay JSON thô. Lỗi hiển thị trong khung chat, `console.error` cho lập trình viên.
- Không gửi prompt rỗng (`trim()`), không cho gửi khi đang chờ.
- Lượt trả lời có `weatherCards` rỗng (Ollama không gọi tool): chỉ hiện `answer`, không đụng panel Kết quả, không bật chấm báo.

### 6.5 Tin tức

Backend hiện **chưa có** tool tin tức. Giữ khung `.news-*` và `renderNewsCard` làm dự phòng, không dùng dữ liệu `NEWS` giả trong bản chạy thật. Chỉ bật khi backend có card tương ứng (đề xuất `type: "news"`).

---

## 7. Quy tắc JavaScript

- Mọi chuỗi từ backend hoặc người dùng đưa vào HTML phải qua `esc()`, kể cả `icon`. Đây là bắt buộc để chống XSS.
- Mỗi loại card một hàm `renderXxxCard(card)` trả chuỗi HTML qua `cardShell()`. Thêm loại card mới = thêm 1 renderer + 1 dòng trong `RENDERERS`, không sửa logic chat.
- Dùng ES module (`import`/`export`), không jQuery, không biến global rải rác.
- Không dùng `innerHTML` với dữ liệu chưa `esc()`. Được dùng `insertAdjacentHTML` cho card dựng từ hàm render.
- Giờ hiển thị: `toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })`.
- Không dùng `localStorage` lưu lịch sử trừ khi được yêu cầu.
- Mock dữ liệu chỉ dùng khi dev offline, đặt sau cờ (`const USE_MOCK = false`) và **phải trả đúng định dạng ở mục 6**.

---

## 8. Accessibility

- Chữ luôn trắng hoặc `--text-dim` trên nền tối.
- `:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }` áp dụng toàn cục, không `outline: none`.
- Mọi input có `<label>` (có thể `visually-hidden`). Nút chỉ có icon có `aria-label`. Icon trang trí cạnh chữ cùng nghĩa thêm `aria-hidden="true"`.
- Tab mobile dùng `role="tablist"`/`role="tab"` và `aria-selected`; mỗi `section` có `aria-label`.
- Mọi animation mới phải tắt trong `@media (prefers-reduced-motion: reduce)`.
- Vùng bấm tối thiểu khoảng 44px trên mobile.

---

## 9. Nên và không nên

**Nên**
- Dùng lại class có sẵn trước khi tạo class mới; tên class ngắn, theo chức năng.
- Gom CSS theo khu, có comment dạng `/* ===== Tên khu ===== */`.
- Dùng `clamp()` cho cỡ chữ lớn như `.temp`.
- Khi thiết kế mẫu thay đổi, cập nhật CSS trong `public/css/` cho khớp rồi báo lại thay đổi.

**Không**
- Không nhúng lại Bootstrap, Icons, font trong view; không copy nguyên `<head>` của file mẫu vào view.
- Không đổi font, bảng màu, gradient nền hoặc độ mờ kính.
- Không dùng shadow đậm, viền màu đặc, nền trắng/đen đặc.
- Không thêm thư viện nặng. Cần biểu đồ nhiệt độ thì dựng SVG/CSS nhẹ theo token.
- Không hiển thị số liệu do LLM viết thay cho số trong card. Số liệu chi tiết chỉ lấy từ `weatherCards`; khi đã gọi tool, `answer` là câu xác nhận ngắn do ứng dụng tạo.
- Không parse `answer` để suy ra dữ liệu.

---

## 10. Checklist trước khi hoàn thành

- [ ] View không có `<html>`, `<head>`, thư viện Bootstrap/Icons/font (đã nằm ở layout).
- [ ] CSS/JS nằm đúng file dùng chung, không có `<style>`/`<script>` dài trong view.
- [ ] Đã render qua master layout với `title` và `active` đúng.
- [ ] Chạy đúng ở 360px, 768px, ≥1200px; không cuộn ngang cả trang.
- [ ] Tab Chat/Kết quả trên mobile hoạt động, chấm báo đúng.
- [ ] Đủ trạng thái: rỗng, đang tải, lỗi (400/502/mạng), không có `weatherCards`.
- [ ] Mọi chuỗi động đã `esc()`.
- [ ] Không lệch token (màu, font, bo góc); có fallback `backdrop-filter`.
- [ ] Dùng bàn phím đi qua được mọi điều khiển, focus nhìn rõ.
- [ ] Endpoint là `/ai/chat`, request/response đúng mục 6.

---

## 11. Câu lệnh mẫu để giao việc cho Copilot

- "Dựa vào `design/weatherbot.html`, tạo view `forecast.ejs` dùng master layout, chỉ chứa phần nội dung trong `<main>`, dùng lại `.glass`, `.forecast-row`."
- "Thêm renderer cho card `type: 'news'` trong `public/js/cards.js` theo mục 6.5, đăng ký vào `RENDERERS`."
- "Chuyển CSS từ mục Chat trong `design/weatherbot.html` sang `public/css/chat.css`, không đổi giá trị nào."
- "Kiểm tra `views/chat.ejs` theo checklist mục 10 và liệt kê chỗ nào chưa đạt."