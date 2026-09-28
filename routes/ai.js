import express from 'express';
import { callOllama } from '../helpers/services/aiTool.js';
import { ok, fail } from '../helpers/http/response.js';

const router = express.Router();

router.post('/chat', async (req, res) => {
	// Nhận prompt hiện tại, model tùy chọn và history do frontend gửi lên.
	const { prompt, model, history } = req.body || {};

	if (typeof prompt !== 'string' || prompt.trim() === '') {
		return fail(res, 'Vui lòng nhập prompt.', 400);
	}

	if (model !== undefined && typeof model !== 'string') {
		return fail(res, 'Model phải là chuỗi.', 400);
	}

	if (history !== undefined && !Array.isArray(history)) {
		// Chặn payload sai kiểu trước khi history đi vào bộ lọc context của aiTool.
		return fail(res, 'Lịch sử chat phải là một mảng.', 400);
	}

	// aiTool sẽ lọc role, giới hạn độ dài và thêm history vào messages gửi Ollama.
	const result = await callOllama(prompt.trim(), model?.trim() || undefined, history);
	if (result === null) {
		return fail(res, 'Không thể kết nối hoặc nhận phản hồi từ Ollama.', 502);
	}

	// weatherCards chứa dữ liệu có cấu trúc để frontend tự dựng giao diện.
	return ok(res, result, 'AI trả lời thành công.');
});

export default router;