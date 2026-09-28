# Kế hoạch chuyển Ollama sang Gemini

## Mục tiêu

Thay Ollama local bằng Gemini API qua SDK JavaScript chính thức `@google/genai`. Giữ nguyên giao diện, `POST /ai/chat` và contract response hiện tại để không phải sửa frontend.

## Hiện trạng

- `routes/ai.js` gọi `callOllama()` và trả `answer`, `weatherCards`, `calledFunctions`.
- `helpers/services/aiTool.js` đang phụ trách gọi Ollama, chuẩn hóa history, fallback và điều phối function call.
- `helpers/services/toolRegistry.js` giữ handler thời tiết hiện tại, dự báo và YouTube; phần thực thi này có thể tiếp tục dùng.
- Test hiện mock HTTP request của Ollama bằng Axios.

## Phạm vi thực hiện

1. Cài `@google/genai`; thay phần gọi Ollama bằng Gemini provider. Giữ interface đầu vào/đầu ra tương thích với route nếu có thể.
2. Chuyển schema Ollama thành Gemini function declarations. Tách schema theo provider khỏi handler thực thi trong registry để mỗi tool chỉ có một handler.
3. Chuyển lịch sử `user`/`bot` sang định dạng contents/roles Gemini và giữ giới hạn history hiện tại.
4. Xử lý response text, function call đơn, nhiều function call, tên tool không hợp lệ và lỗi service. Giới hạn số tool call mỗi lượt; ban đầu thực thi tuần tự để tránh request trùng tới OpenStreetMap và dễ kiểm soát lỗi.
5. Giữ response contract `{ answer, weatherCards, calledFunctions }`. Khi có card, giữ câu xác nhận cố định và để frontend hiển thị số liệu; không gửi thêm một lượt Gemini chỉ để diễn đạt lại kết quả.
6. Thêm `GEMINI_API_KEY` và `GEMINI_MODEL` vào cấu hình; đặt API key thật chỉ trong `.env`. `.env.example` chỉ có placeholder, không có secret.
7. Cập nhật `docs/project-overview.md` và tài liệu service: yêu cầu Gemini/API key, cách tạo `.env`, cài dependency, chạy và xử lý quota/lỗi. Bỏ hướng dẫn cài Ollama nếu không còn provider Ollama.

## Kiểm thử

- Mock SDK Gemini, không cần API key thật trong test.
- Text response không gọi tool.
- Gọi riêng current weather, forecast và YouTube.
- Nhiều function call trong một response, giữ đủ card và `calledFunctions`.
- Một tool lỗi/không hợp lệ không làm mất kết quả của tool hợp lệ khác.
- Kiểm tra route validation và response contract không đổi.
- Chạy `npm test`; sau đó smoke test Gemini thật bằng API key local, không ghi key vào log hoặc Git.

## Tiêu chí hoàn tất

- Chat hoạt động khi Ollama chưa cài/chưa chạy, nếu Gemini API key hợp lệ.
- Giao diện và contract của `/ai/chat` không đổi.
- Test không phụ thuộc mạng hoặc API key thật.
- `.env` không được commit; `.env.example` có hướng dẫn cấu hình không bí mật.
- Hai tài liệu mô tả đúng provider và lệnh setup mới.

## Rủi ro và lưu ý

- Gemini cần Internet và API key; quota/chi phí phụ thuộc cấu hình tài khoản Google.
- Gemini và Ollama khác định dạng tool schema, history và function-call response; không nên chỉ thay URL/model trong config.
- Chọn model Gemini đang hỗ trợ function calling tại thời điểm triển khai, rồi xác nhận qua smoke test.
