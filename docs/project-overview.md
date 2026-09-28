# WeatherBot AI Assistant

## 1. Ý tưởng dự án

WeatherBot là ứng dụng trợ lý AI hỗ trợ người dùng tra cứu thời tiết và phát nhạc YouTube thông qua giao diện trò chuyện. Người dùng có thể đặt câu hỏi bằng ngôn ngữ tự nhiên, ví dụ:

- Thời tiết Thanh Hóa hiện tại thế nào?
- Dự báo thời tiết Hà Nội hôm nay.
- Phát bài hát Xương rồng - Dangrangto.

Kết quả thời tiết được hiển thị dưới dạng card dữ liệu, còn bài hát được hiển thị bằng card video YouTube nhúng.

## 2. Lý do ra đời

Các ứng dụng thời tiết truyền thống thường tập trung vào việc hiển thị dữ liệu theo mẫu cố định như thành phố, nhiệt độ và dự báo. Dự án này được xây dựng với mục tiêu khác: không muốn làm một ứng dụng thời tiết theo lối mòn mà muốn luyện tập tích hợp Agent AI với các API và dịch vụ bên thứ ba.

Thông qua dự án, người phát triển có thể thực hành cách để AI:

- Hiểu yêu cầu tự nhiên của người dùng.
- Chọn tool phù hợp.
- Truyền tham số cho tool.
- Gọi API bên thứ ba.
- Chuyển dữ liệu thô thành kết quả dễ sử dụng trên giao diện.

## 3. Mục tiêu

- Xây dựng giao diện chat đơn giản, thân thiện.
- Tích hợp Ollama để xử lý ngôn ngữ tự nhiên và tool calling.
- Lấy dữ liệu thời tiết thực tế từ Open-Meteo.
- Chuyển địa điểm thành tọa độ bằng dữ liệu cục bộ hoặc OpenStreetMap.
- Tích hợp tìm kiếm và phát video YouTube.
- Thực hành thiết kế hệ thống có thể mở rộng thêm nhiều tool khác.

## 4. Công nghệ sử dụng

### Backend

- Node.js và Express: xây dựng HTTP server và REST API.
- EJS: render giao diện phía server.
- Axios: gọi Ollama, OpenStreetMap và Open-Meteo.
- Ollama: chạy mô hình ngôn ngữ cục bộ và chọn tool.
- `node-cache`: cache tọa độ và dữ liệu thời tiết.
- Winston và Morgan: ghi log ứng dụng và request HTTP.
- `yt-search`: tìm video YouTube từ tên bài hát để lấy `videoId`.
- Dotenv: quản lý cấu hình qua biến môi trường.

### Frontend

- HTML, CSS và JavaScript thuần.
- Bootstrap và Bootstrap Icons qua CDN.
- EJS master layout.
- Điều khiển YouTube iframe bằng `postMessage` để tạm dừng bài cũ khi phát bài mới.

### Ba trang chính

- `/`: trang giới thiệu ý tưởng, công nghệ và các hướng sử dụng của dự án.
- `/basic`: tra cứu trực tiếp, nhận một địa điểm rồi trả cả thời tiết hiện tại và dự báo 7 ngày; không gọi Ollama.
- `/chat`: giao diện Chat AI hiện tại, cho phép Ollama chọn weather tool hoặc YouTube tool.

Ba trang dùng chung nav trong master layout và cùng bộ nhận diện glassmorphism.

### Dịch vụ bên thứ ba

- OpenStreetMap Nominatim: tìm tọa độ địa điểm.
- Open-Meteo: cung cấp dữ liệu thời tiết hiện tại và dự báo.
- YouTube: cung cấp video nhúng.
- Ollama: cung cấp khả năng hiểu ngôn ngữ và gọi tool.

## 5. Kiến trúc và luồng hoạt động

1. Người dùng nhập câu hỏi trên giao diện chat.
2. Frontend gửi prompt và lịch sử hội thoại đến `POST /ai/chat`.
3. Backend gửi system prompt, history và danh sách tool cho Ollama.
4. Ollama chọn tool và tạo tham số.
5. `toolRegistry` chuyển tool call đến handler tương ứng.
6. Handler gọi API hoặc service bên thứ ba.
7. Backend chuẩn hóa kết quả thành card JSON.
8. Frontend chọn renderer theo `card.type` và hiển thị card.

Các tool hiện tại:

- `get_weather_by_address`: thời tiết hiện tại.
- `get_forecast_by_address`: dự báo 7 ngày.
- `play_youtube_music`: tìm và nhúng bài hát YouTube.

## 6. Chức năng nổi bật

- Chat bằng tiếng Việt tự nhiên.
- Lưu và gửi lịch sử hội thoại để duy trì ngữ cảnh.
- Fallback khi model không tự gọi đúng tool.
- Ưu tiên địa điểm trong câu hỏi hiện tại, tránh dùng nhầm địa điểm cũ.
- Cache dữ liệu để giảm số lần gọi API.
- Card thời tiết hiện tại và dự báo.
- Card YouTube có video nhúng và liên kết mở trực tiếp.
- Khi phát bài mới, iframe bài cũ được pause để tránh chồng âm thanh.
- Responsive cho desktop và mobile.

## 7. Kết quả đạt được

Dự án đã xây dựng được một ứng dụng chạy được end-to-end từ giao diện chat đến AI, tool nội bộ, API bên thứ ba và card hiển thị. Kiến trúc registry giúp việc thêm tool mới rõ ràng hơn, không cần mở rộng chuỗi điều kiện phức tạp trong một file duy nhất.

Dự án cũng giúp làm rõ các vấn đề thực tế khi tích hợp Agent AI như model chọn sai tool, context làm thay đổi kết quả, timeout API, dữ liệu không hợp lệ và kiểm soát iframe bên thứ ba.

## 8. Hạn chế hiện tại

- Model nhỏ đôi khi chọn sai tool hoặc không gọi tool.
- Fallback hiện mới xử lý một số trường hợp rõ ràng.
- Tìm kiếm YouTube phụ thuộc vào thư viện scraping và kết quả YouTube.
- Cache hiện lưu trong bộ nhớ, mất khi server khởi động lại.
- Frontend đang dùng JavaScript thuần nên khi số lượng tính năng tăng sẽ cần tổ chức component tốt hơn.

## 9. Hướng phát triển

- Tích hợp thêm nhiều tool tiện ích như tin tức, bản đồ, lịch, nhắc việc, dịch thuật và tìm kiếm web.
- Sử dụng model mạnh hơn để cải thiện khả năng hiểu ngữ cảnh và chọn tool.
- Thêm cơ chế chọn tool rõ ràng từ giao diện như `Tự động`, `Thời tiết` và `Âm nhạc`.
- Hoàn thiện validation, retry, timeout và monitoring cho các API bên thứ ba.
- Tách frontend thành hệ thống component chuyên nghiệp hơn bằng Angular hoặc React.
- Bổ sung kiểm tra runtime cho tham số tool và mở rộng test riêng cho từng service/tool.
- Sử dụng database hoặc Redis để lưu conversation và cache khi triển khai nhiều instance.
- Bổ sung xác thực người dùng, phân quyền và quản lý lịch sử cá nhân.
- Đóng gói bằng Docker và triển khai lên cloud.

## 10. Hướng dẫn cài đặt và chạy demo

### Cài đặt

Yêu cầu Node.js `20.18.1+`, npm và Ollama.

```powershell
npm install
winget install Ollama.Ollama
ollama pull qwen2.5:1.5b
```

Nếu Ollama chưa tự chạy, mở terminal riêng:

```powershell
ollama serve
```

### Chạy ứng dụng

Từ thư mục gốc của dự án:

```powershell
npm run dev
```

Mở trình duyệt tại [http://localhost:3000](http://localhost:3000).

### Demo nhanh

Nhập thử các câu:

- `Thời tiết Thanh Hóa hiện tại`
- `Dự báo thời tiết Hà Nội`
- `Phát bài hát Xương rồng - Dangrangto`

Có thể chạy test bằng:

```powershell
npm test
```

Hướng dẫn triển khai đầy đủ nằm trong [weather-ai-service.md](weather-ai-service.md).

## 11. Kết luận

WeatherBot không chỉ là ứng dụng xem thời tiết mà là một bài tập thực tế về xây dựng Agent AI có khả năng sử dụng tool. Dự án kết hợp AI cục bộ, API thời tiết, tìm kiếm YouTube và giao diện chat để tạo ra một sản phẩm có tính tương tác cao, đồng thời tạo nền tảng để tiếp tục mở rộng thành một trợ lý đa năng trong tương lai.
