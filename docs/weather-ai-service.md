# Giải thích service thời tiết, AI Tool Call và YouTube Music

Tài liệu này mô tả luồng chat hiện tại của project, từ HTTP request đến câu trả lời của Ollama, dữ liệu thời tiết và card video YouTube. Ví dụ thời tiết xuyên suốt là:

> Thời tiết Thanh Hóa hôm nay thế nào?

## 1. Các phần tham gia

| Phần | Vai trò |
| --- | --- |
| `routes/ai.js` | Nhận `POST /ai/chat`, kiểm tra dữ liệu đầu vào và trả response HTTP. |
| `helpers/services/aiTool.js` | Gửi prompt/context cho Ollama, xử lý fallback và điều phối tool call. |
| `helpers/services/toolRegistry.js` | Registry chứa schema và handler của từng tool; dispatcher gọi đúng handler và trả presentation card. |
| `helpers/services/weatherCard.js` | Tạo dữ liệu card JSON và context ngắn từ JSON thời tiết gốc. |
| `helpers/services/weather.js` | Tìm tọa độ địa điểm, lấy thời tiết hiện tại hoặc dự báo, quản lý cache. |
| `helpers/services/youtube.js` | Tìm video YouTube bằng query, validate `videoId` và tạo card embed an toàn. |
| OpenStreetMap | Chuyển tên địa điểm như Thanh Hóa thành tọa độ. |
| Open-Meteo | Trả dữ liệu thời tiết theo tọa độ. |
| `helpers/logger.js` | Ghi log JSON ra console và file. |
| `public/js/weatherbot.js` | Gửi prompt/history, lưu lịch sử trình duyệt, render weather/YouTube card và điều khiển pause iframe. |
| `public/css/weatherbot.css` | Style cho panel kết quả, card weather và khung video YouTube. |

Ollama không tự gọi OpenStreetMap, Open-Meteo hoặc YouTube. Ollama chỉ chọn tool và tạo tham số. `aiTool.js` chuyển tool call sang `toolRegistry.js`; handler trong registry mới gọi service thực tế.

## 2. Gửi câu hỏi đến API

Endpoint nhận JSON như sau:

```http
POST /ai/chat
Content-Type: application/json
```

Các trường đầu vào:

- `prompt` (bắt buộc): câu hỏi dạng chuỗi, không được để trống.
- `model` (tùy chọn): tên model Ollama. Nếu bỏ qua, dùng model mặc định trong cấu hình.
- `history` (tùy chọn): mảng message `{ role: 'user' | 'bot', text: string }` từ frontend; backend tự lọc và chỉ giữ 12 message gần nhất.

### Ví dụ: thời tiết hiện tại

Request:

```json
{
  "prompt": "Thời tiết Thanh Hóa hiện tại thế nào?"
}
```

Response thành công (`200`):

```json
{
  "success": true,
  "message": "AI trả lời thành công.",
  "data": {
    "answer": "Mình đã cập nhật kết quả bên cạnh nhé.",
    "weatherCards": [
      {
        "type": "current",
        "location": "Thanh Hóa",
        "icon": "bi bi-cloud-rain",
        "condition": "Mưa nhẹ",
        "meme": "Mưa đêm trút nhẹ xuống hiên nhà\nGiọt nhỏ bay nghiêng phủ mái nhà\nMấy chiếc thuyền nan trôi cuối bến\nTrà thơm đợi nắng ghé hiên xa",
        "current": {
          "temperature": { "value": 25, "unit": "°C" },
          "humidity": { "value": 70, "unit": "%" },
          "windSpeed": { "value": 8, "unit": "km/h" }
        }
      }
    ],
    "calledFunctions": [
      {
        "name": "get_weather_by_address",
        "arguments": { "address": "Thanh Hóa" }
      }
    ]
  }
}
```

### Ví dụ: dự báo thời tiết

Request, có thể chỉ định model nếu cần:

```json
{
  "prompt": "Dự báo thời tiết Thanh Hóa hôm nay",
  "model": "qwen2.5:1.5b"
}
```

Response thành công (`200`):

```json
{
  "success": true,
  "message": "AI trả lời thành công.",
  "data": {
    "answer": "Mình đã cập nhật kết quả bên cạnh nhé.",
    "weatherCards": [
      {
        "type": "forecast",
        "location": "Thanh Hóa",
        "days": [
          {
            "date": "2026-09-28",
            "icon": "bi bi-cloud-rain",
            "condition": "Mưa nhẹ",
            "temperatureMax": { "value": 34.1, "unit": "°C" },
            "temperatureMin": { "value": 24.8, "unit": "°C" },
            "rainProbability": { "value": 10, "unit": "%" }
          },
          {
            "date": "2026-09-29",
            "icon": "bi bi-clouds",
            "condition": "Nhiều mây",
            "temperatureMax": { "value": 33.9, "unit": "°C" },
            "temperatureMin": { "value": 25.3, "unit": "°C" },
            "rainProbability": { "value": 8, "unit": "%" }
          }
        ]
      }
    ],
    "calledFunctions": [
      {
        "name": "get_forecast_by_address",
        "arguments": { "address": "Thanh Hóa" }
      }
    ]
  }
}
```

Các giá trị thời tiết và câu trả lời trong ví dụ chỉ để minh họa cấu trúc, không phải dữ liệu trực tiếp. Card dự báo thực tế thường có tối đa 7 phần tử trong `days`; ví dụ trên chỉ hiển thị 2 ngày để dễ đọc. Nếu không gửi `model`, `callOllama()` dùng `env.ollamaModel`.

`weatherCards` là mảng dữ liệu để frontend tự dựng UI. Card `current` có số liệu trong `current`; card `forecast` có các ngày trong `days`. Dùng `icon` làm class cho Bootstrap Icons, hiển thị số từ `value` và đơn vị từ `unit`. `calledFunctions` cho biết Ollama đã yêu cầu gọi hàm nào cùng arguments; nếu không gọi tool thì mảng này rỗng.

Trong `routes/ai.js`, route kiểm tra `prompt` phải là chuỗi không rỗng và `model`, nếu có, phải là chuỗi. Prompt sai định dạng trả `400`. Nếu `callOllama()` không nhận được kết quả từ Ollama và trả `null`, route trả `502`.

### Ví dụ: phát nhạc YouTube

Request:

```json
{
  "prompt": "Phát bài hát Xương rồng - Dangrangto"
}
```

Response thành công có card dạng `youtube`:

```json
{
  "type": "youtube",
  "title": "Dangrangto - xương rồng",
  "videoId": "PWRlaRB2F_g",
  "embedUrl": "https://www.youtube.com/embed/PWRlaRB2F_g",
  "youtubeUrl": "https://www.youtube.com/watch?v=PWRlaRB2F_g"
}
```

`videoId` trong ví dụ chỉ minh họa. Backend không cho model tự bịa `videoId`; `youtube.js` tìm video bằng `yt-search` và chỉ tạo card khi ID khớp định dạng YouTube hợp lệ.

## 3. Ollama nhận prompt và danh sách tool

`callOllama()` gửi request đến Ollama tại `/api/chat`. Request gồm:

- `model`: model được chọn hoặc model mặc định.
- `messages`: hướng dẫn system về cách chọn tool, sử dụng số liệu chính xác, giải thích thuật ngữ và câu hỏi của người dùng.
- `tools`: các hàm mà Ollama được phép yêu cầu ứng dụng chạy.
- `stream: false`: chờ toàn bộ câu trả lời trong một response.

Hiện có ba tool được đăng ký trong `helpers/services/toolRegistry.js`:

1. `get_weather_by_address`: lấy thời tiết hiện tại; cần tham số chuỗi `address`.
2. `get_forecast_by_address`: lấy dự báo 7 ngày; cần tham số chuỗi `address`.
3. `play_youtube_music`: tìm và nhúng video YouTube; cần tham số chuỗi `query`.

Hướng dẫn system phân biệt cách gọi: “hôm nay”, “ngày mai”, “dự báo”, nhiệt độ cao/thấp hoặc xác suất mưa thì dùng dự báo; “bây giờ”, “hiện tại”, “lúc này” thì dùng thời tiết hiện tại. Các động từ “phát”, “nghe”, “mở”, “bật” trong yêu cầu nhạc thì dùng YouTube. Sau khi tool chạy, ứng dụng tự tạo card và không gọi Ollama lần nữa.

`callOllama()` gửi `options.temperature: 0` để giảm tính ngẫu nhiên. Nếu model không trả `tool_calls`, fallback hẹp trong `aiTool.js` chỉ dựng tool call khi tín hiệu đủ rõ. Fallback music được ưu tiên hơn weather nếu prompt có động từ phát nhạc; fallback weather ưu tiên địa điểm trong prompt hiện tại để history cũ không lấn át địa điểm mới.

Khai báo `properties.address` mô tả tên và kiểu dữ liệu của tham số. `required: ['address']` nói rằng tham số này bắt buộc.

Với câu hỏi ví dụ, Ollama có thể trả về tool call như sau:

```json
{
  "function": {
    "name": "get_weather_by_address",
    "arguments": {
      "address": "Thanh Hóa"
    }
  }
}
```

Đây là quyết định của model dựa trên câu hỏi và mô tả tool. Không phải JavaScript tự suy ra địa chỉ. Model nhỏ cũng có thể chọn sai tool hoặc tạo tham số chưa đúng.

## 4. Registry và dispatcher chạy tool

`aiTool.js` không còn chứa chuỗi `if/else` gọi từng service. `toolRegistry.js` giữ schema và handler của mỗi tool. `toolDefinitions` chỉ lấy schema gửi cho Ollama; `executeToolCall()` tìm handler theo `toolCall.function.name`.

Luồng dispatcher khái quát:

```js
const registeredTool = toolRegistry[name];
const presentation = await registeredTool.execute(argumentsObject);
weatherCards.push(presentation.card);
```

Với weather, handler gọi `getWeatherByAddress()` hoặc `getForecastByAddress()` rồi dùng `weatherCard.js`. Với YouTube, handler gọi `createYoutubeCard(query)` rồi trả card `youtube`. Nếu tool không đăng ký hoặc service trả `null`, dispatcher bỏ qua card đó và ghi warning thay vì làm crash toàn bộ request.

## 5. Context hội thoại

Frontend lưu lịch sử hiển thị trong `localStorage`, sau đó gửi lịch sử cũ cùng prompt mới đến `POST /ai/chat`. Prompt hiện tại không bị gửi trùng trong history.

Backend lọc history chỉ còn role `user` và `bot`, đổi `bot` thành `assistant`, cắt tối đa 12 message gần nhất và giới hạn mỗi message 2.000 ký tự. Sau đó messages gửi Ollama có thứ tự:

1. `system` message.
2. History đã lọc.
3. Prompt hiện tại.

History chỉ giúp model hiểu câu nối tiếp; địa điểm và ý định trong prompt hiện tại vẫn được ưu tiên bởi fallback và bước hiệu chỉnh tool call.

## 6. Tìm tọa độ địa điểm

`getWeatherByAddress('Thanh Hóa')` gọi `getCoordinatesByAddress('Thanh Hóa')` trước.

Đầu tiên, hàm tìm tên địa điểm trong danh sách JSON cục bộ. Danh sách có các địa điểm Việt Nam cùng một số địa điểm quốc tế như Seoul, New York và Bắc Cực. Tên được chuẩn hóa để các cách viết như `Tỉnh Thanh Hóa`, `Thanh Hóa` và ` thanh hoa ` có thể khớp nhau. Nếu tìm thấy, hàm trả tọa độ đại diện ngay, không gọi OpenStreetMap.

- Nếu tên không có trong danh sách cục bộ, hàm kiểm tra cache key từ địa chỉ đã bỏ khoảng trắng đầu/cuối và chuyển thành chữ thường.
- Nếu cache có tọa độ còn hạn, hàm dùng lại tọa độ và không gọi OpenStreetMap.
- Nếu cache không có, hàm gửi request đến OpenStreetMap với địa chỉ người dùng, `format: 'json'`, `limit: 1`.
- Request có timeout 5 giây.
- OpenStreetMap thường trả `lat` và `lon` dưới dạng chuỗi; service đổi chúng thành số.
- Tọa độ tìm thấy được cache trong 1 ngày.
- Nếu không tìm thấy địa chỉ hoặc request lỗi, hàm trả `null`.

Danh sách nằm trong `helpers/data/vietnamProvinces.json`, chỉ gồm tên, aliases và tọa độ. Các tọa độ là tọa độ đại diện của tỉnh/thành, không phải tọa độ chính xác của từng phường/xã hoặc địa chỉ. Địa chỉ cụ thể không khớp tên tỉnh/thành sẽ tiếp tục dùng OpenStreetMap.

Response tọa độ minh họa:

```js
{ lat: 19.8, lon: 105.7 }
```

Tọa độ trên chỉ minh họa cấu trúc dữ liệu, không phải kết quả tra cứu thực tế.

## 7. Lấy thời tiết hiện tại

Khi có tọa độ, `getWeatherByAddress()` gọi:

```js
getWeatherByCoordinates(lat, lon);
```

Service kiểm tra cache bằng key tọa độ:

- Cache còn hạn: trả lại dữ liệu đã lưu.
- Cache trống hoặc hết hạn: gọi Open-Meteo, timeout 5 giây.

Request hiện tại hỏi Open-Meteo các trường:

- `temperature_2m`: nhiệt độ.
- `relative_humidity_2m`: độ ẩm tương đối.
- `weather_code`: mã mô tả thời tiết.
- `wind_speed_10m`: tốc độ gió.

Response thành công được cache 10 phút. Service trả toàn bộ JSON Open-Meteo, gồm metadata địa điểm/múi giờ và phần `current`. Nếu request lỗi, service trả `null`.

## 8. Tạo dữ liệu card và câu trả lời

Sau khi service trả JSON Open-Meteo, `weatherCard.js` tạo object card, không tạo HTML hay ASCII. Mapping trong `weatherCodeMap.json` cung cấp `description`, `meme` và class Bootstrap Icons, ví dụ `bi bi-cloud-rain`.

Với forecast, code ghép ngày, nhiệt độ cao/thấp, xác suất mưa và icon theo cùng chỉ số của các mảng `daily`. Mỗi số liệu giữ nguyên kiểu số trong `value`; `unit` được lấy từ `daily_units`. Card forecast trả danh sách `days`, mỗi phần tử là một ngày.

Sau khi model hoặc fallback chọn tool, `aiTool.js` chuyển call qua dispatcher, chạy handler, tạo `weatherCards` rồi tự trả câu xác nhận cố định. Ứng dụng không gọi Ollama thêm lần nữa sau khi có dữ liệu, nên số liệu chỉ xuất hiện trong card và không thể bị câu trả lời lặp lại.

Nếu lần phản hồi đầu tiên không có `tool_calls`, helper thử fallback hẹp cho nhạc và weather. Chỉ khi fallback cũng không nhận diện được ý định rõ ràng thì helper mới trả thẳng `message.content` với `weatherCards` rỗng.

## 9. Luồng phát nhạc YouTube từ backend đến frontend

Luồng đầy đủ của yêu cầu `Phát bài hát Xương rồng - Dangrangto`:

1. Frontend gửi `{ prompt, history }` đến `POST /ai/chat`.
2. `routes/ai.js` kiểm tra prompt và chuyển dữ liệu cho `callOllama()`.
3. Ollama chọn `play_youtube_music` với `{ query: "Xương rồng - Dangrangto" }`. Nếu model chọn nhầm weather hoặc không trả tool call nhưng prompt có động từ `phát/nghe/mở/bật`, fallback trong `aiTool.js` thay bằng music tool.
4. `toolRegistry.js` chuyển tool call đến handler YouTube.
5. `youtube.js` làm sạch query, gọi `yt-search`, lấy video đầu tiên, kiểm tra `videoId` đúng 11 ký tự và tạo `embedUrl` dạng `/embed/{videoId}`. Query rỗng, quá dài hoặc không tìm thấy video sẽ không tạo card.
6. Backend trả `weatherCards` chứa card `type: "youtube"`; frontend không nhận HTML từ backend.
7. `public/js/weatherbot.js` kiểm tra `videoId`, tự dựng iframe với `enablejsapi=1` và `origin` hiện tại, sau đó render card qua `cardRenderers.youtube`.
8. Khi người dùng phát bài mới, frontend gửi `pauseVideo` qua `postMessage` đến các iframe YouTube cũ trước khi chèn card mới. Card cũ vẫn được giữ trong history và DOM; chỉ âm thanh cũ bị dừng.
9. Khi người dùng hỏi weather, frontend chỉ prepend weather card và không gọi `pauseVideo`, nên bài nhạc hiện tại không bị ngắt.

Trình duyệt vẫn có thể chặn autoplay theo chính sách của trình duyệt. Người dùng cần bấm nút play trong iframe nếu YouTube không tự phát.

## 10. Ý nghĩa của từ “hôm nay”

Tool `get_weather_by_address` lấy các giá trị thời tiết hiện tại tại thời điểm gọi API. Nó không tính tóm tắt nhiệt độ cao/thấp của cả ngày.

Tool `get_forecast_by_address` lấy dự báo 7 ngày, gồm nhiệt độ cao nhất/thấp nhất, xác suất mưa cao nhất và mã thời tiết theo từng ngày. Trong dữ liệu `daily`, ngày đầu tiên thường là ngày hiện tại theo múi giờ được yêu cầu.

Với quy tắc hiện tại, câu “Thời tiết Thanh Hóa hôm nay thế nào?” được hướng tới tool dự báo. Card lấy `temperature_2m_max`, `temperature_2m_min`, `precipitation_probability_max`, `weather_code` và ngày trực tiếp từ JSON. `weatherCodeMap.json` đổi mã thành mô tả, bài thơ và icon class.

Ollama chỉ quyết định tool và arguments. Sau khi service chạy xong, ứng dụng trả lời xác nhận cố định; toàn bộ ngày và số liệu nằm trong `weatherCards` do code tạo.

## 11. Cache

Cache được tạo bằng `node-cache` trong bộ nhớ của tiến trình Node.js:

| Dữ liệu | Cache key | Thời hạn |
| --- | --- | --- |
| Tọa độ | Địa chỉ đã chuẩn hóa | 1 ngày |
| Thời tiết hiện tại | Vĩ độ và kinh độ | 10 phút |
| Dự báo | Vĩ độ và kinh độ | 1 giờ |

Chỉ response thành công được lưu. Cache giới hạn tối đa 1000 mục. Cache mất khi server khởi động lại và không được chia sẻ giữa nhiều tiến trình.

## 12. Log

`helpers/logger.js` dùng Winston để ghi JSON ra cả console và `logs/app.log`. File log xoay khi đạt 5 MB, giữ tối đa 5 file.

- Morgan ghi log request HTTP như method, URL, status và thời gian.
- `aiTool.js` ghi model/tool được chọn và lỗi Ollama.
- `youtube.js` không ghi query hoặc dữ liệu video nhạy cảm; lỗi tìm video được chuyển thành card rỗng.
- `weather.js` ghi cache hit, kết quả tra cứu địa chỉ và lỗi gọi API thời tiết.
- Prompt, địa chỉ người dùng và dữ liệu thời tiết không được ghi log.
- Thư mục `logs/` được bỏ qua bởi Git.

## 13. Lỗi có thể gặp

- Prompt rỗng hoặc không phải chuỗi: API trả `400`.
- Ollama chưa chạy, model chưa có hoặc Ollama API lỗi: helper ghi log, trả `null`; route trả `502`.
- OpenStreetMap không tìm thấy địa chỉ: service tọa độ trả `null`; tool không có dữ liệu thời tiết để trả lại.
- OpenStreetMap hoặc Open-Meteo quá 5 giây/lỗi mạng: service ghi log và trả `null`.
- Model chọn tool hoặc tham số sai: kết quả phụ thuộc vào model; cần kiểm tra dữ liệu tool call trước khi dùng trong ứng dụng thực tế.
- YouTube search không trả video hoặc `videoId` không hợp lệ: backend bỏ qua card YouTube, không render iframe hỏng.
- Nhiều iframe YouTube: frontend gửi `pauseVideo` cho iframe cũ khi có card YouTube mới; không xóa card lịch sử.

## 14. Thư viện npm và lý do sử dụng

Các dependency runtime trong `package.json`:

| Thư viện | Mục đích | Lý do chọn |
| --- | --- | --- |
| `express` | HTTP server, route và middleware | Framework Node.js nhẹ, phù hợp cấu trúc route hiện tại. |
| `ejs` | Render master layout và view | Giữ server-rendered HTML đơn giản, không cần build frontend. |
| `axios` | Gọi Ollama, OSM và Open-Meteo | API promise rõ ràng, hỗ trợ timeout và mock dễ trong test. |
| `dotenv` | Đọc biến môi trường từ `.env` | Tách URL/model khỏi source code. |
| `node-cache` | Cache tọa độ, weather và forecast trong memory | Giảm request lặp và phù hợp app đơn tiến trình hiện tại. |
| `winston` | Log JSON ra console/file | Log có cấu trúc, hỗ trợ theo dõi lỗi runtime. |
| `morgan` | Log request HTTP | Theo dõi method, URL, status và thời gian response của Express. |
| `cookie-parser` | Middleware đọc cookie | Giữ tương thích với cấu trúc Express hiện có và các route mở rộng sau này. |
| `debug` | Namespace debug cho hệ sinh thái Express | Dependency tương thích với các package Express đang dùng. |
| `yt-search` | Tìm video YouTube từ tên bài hát để lấy `videoId` | Không phải tự bịa ID hoặc nhúng search URL không phát được; backend có thể validate ID trước khi trả card. |

Bootstrap, Bootstrap Icons và Be Vietnam Pro hiện được nạp bằng CDN trong layout, không phải dependency npm.

## 15. Hướng dẫn cài đặt, chạy và triển khai

### 15.1. Yêu cầu môi trường

- Windows PowerShell, macOS hoặc Linux.
- Node.js `20.18.1+` và npm. Dùng bản Node.js LTS mới nhất là lựa chọn ưu tiên.
- Ollama đã cài và có model `qwen2.5:1.5b`.
- Kết nối Internet để gọi OpenStreetMap, Open-Meteo và tìm video YouTube.
- Không cần cài Bootstrap, Bootstrap Icons hoặc font bằng npm vì layout đang nạp chúng từ CDN.

Kiểm tra Node.js và npm:

```powershell
node --version
npm --version
```

### 15.2. Cài thư viện của project

Chạy từ thư mục gốc chứa `package.json`:

```powershell
npm install
```

Lệnh này cài toàn bộ dependency trong `package.json`, gồm Express, Axios, EJS, Node Cache, Winston, `yt-search` và các package hỗ trợ khác. Không cần cài riêng từng thư viện bằng lệnh khác.

### 15.3. Cài và chuẩn bị Ollama

Trên Windows có thể cài Ollama bằng:

```powershell
winget install Ollama.Ollama
```

Nếu đã cài Ollama Desktop, có thể bỏ qua lệnh trên. Kiểm tra Ollama:

```powershell
ollama --version
```

Tải model mặc định của project:

```powershell
ollama pull qwen2.5:1.5b
ollama list
```

Nếu Ollama chưa tự chạy dưới dạng service, mở một terminal riêng và chạy:

```powershell
ollama serve
```

Kiểm tra API Ollama:

```powershell
Invoke-RestMethod http://localhost:11434/api/tags
```

Nếu dùng model khác, đặt tên model đó trong `.env`:

```env
OLLAMA_MODEL=qwen2.5:1.5b
OLLAMA_API_URL=http://localhost:11434
```

### 15.4. Kiểm tra cấu hình `.env`

File `.env` tối thiểu:

```env
PORT=3000
NODE_ENV=development
API_BASE_URL=http://localhost:3000
OLLAMA_API_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:1.5b
OPEN_STREET_MAP_URL=https://nominatim.openstreetmap.org/search
OPEN_METEO_URL=https://api.open-meteo.com/v1/forecast
```

Nếu triển khai thật, nên đặt User-Agent riêng cho Nominatim:

```env
OPEN_STREET_MAP_USER_AGENT=WeatherBot/1.0 (contact@example.com)
```

Không đưa API key hoặc thông tin bí mật vào Git. Hiện tính năng YouTube dùng `yt-search`, nên không cần YouTube API key.

### 15.5. Chạy ở môi trường phát triển

Chạy server thường:

```powershell
npm start
```

Hoặc dùng Node watch để tự khởi động lại khi file thay đổi:

```powershell
npm run dev
```

Mở ứng dụng tại:

```text
http://localhost:3000
```

### 15.6. Chạy test

Chạy toàn bộ test:

```powershell
npm test
```

Chạy riêng test route và registry:

```powershell
node --test tests/aiRoute.test.js tests/toolRegistry.test.js
```

Các test hiện mock request nên không bắt buộc Ollama, OpenStreetMap, Open-Meteo hoặc YouTube đang chạy. Muốn kiểm tra thật tool thời tiết/YouTube thì cần bật Ollama và Internet.

### 15.7. Chạy production đơn giản

Sau khi cài dependency và chuẩn bị Ollama:

```powershell
$env:NODE_ENV = 'production'
npm start
```

Có thể đổi port trước khi chạy:

```powershell
$env:PORT = '8080'
npm start
```

Ứng dụng không có bước build frontend; Express phục vụ trực tiếp `public/` và render EJS phía server. Khi triển khai lên máy chủ, cần bảo đảm process Node chạy liên tục, port được mở và Ollama có thể truy cập tại `OLLAMA_API_URL`.

### 15.8. Checklist kiểm tra sau triển khai

1. `GET /` trả HTTP `200` và giao diện tải được CSS/JS.
2. `POST /ai/chat` với prompt hợp lệ trả HTTP `200`.
3. Prompt weather tạo card `current` hoặc `forecast` đúng địa điểm.
4. Prompt phát nhạc tạo card `youtube` có `videoId` hợp lệ.
5. Phát bài YouTube mới gửi `pauseVideo` cho iframe cũ, không chồng âm thanh.
6. Ollama còn hoạt động tại `http://localhost:11434/api/tags` hoặc URL đã cấu hình.
