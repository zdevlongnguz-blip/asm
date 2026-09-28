import axios from 'axios';
import { env } from '../config/env.js';
import { logger } from '../logger.js';
import { findKnownLocationInText } from './weather.js';
import { toolDefinitions, executeToolCall } from './toolRegistry.js';

const getAvailableModels = async () => {
	try {
		const response = await axios.get(`${env.ollamaApiUrl}/api/tags`);
		return response.data.models.map((model) => model.name);
	} catch (error) {
		logger.error('Không thể lấy danh sách model Ollama', { error: error.message });
		return null;
	}
};

const normalizeHistory = (history) => (Array.isArray(history) ? history : [])
	// Chỉ nhận message do giao diện tạo; loại bỏ role lạ để client không chèn system message.
	.filter((entry) => ['user', 'bot'].includes(entry?.role) && typeof entry.text === 'string')
	// Giữ tối đa 12 message gần nhất, tương đương khoảng 6 cặp user/assistant.
	.slice(-12)
	.map((entry) => ({
		// Ollama dùng assistant, còn frontend đặt tên vai trò phản hồi là bot.
		role: entry.role === 'bot' ? 'assistant' : 'user',
		// Giới hạn độ dài mỗi message để history không chiếm hết context của model.
		content: entry.text.slice(0, 2000),
	}));

const createFallbackToolCall = (prompt, history) => {
	// Fallback weather chỉ là lưới an toàn: nó chạy khi model không tạo tool call đáng tin cậy.
	// Hàm không gọi API và không lấy dữ liệu; nó chỉ dựng object cùng format tool call của Ollama.
	// Ghép history để hiểu câu nối tiếp, nhưng prompt hiện tại vẫn được phân tích riêng bên dưới.
	const historyText = Array.isArray(history) ? history.map((entry) => entry?.text || '').join(' ') : '';
	// History chỉ cung cấp ngữ cảnh cho câu nối tiếp, còn prompt hiện tại luôn được ưu tiên quyết định.
	// Bỏ dấu tiếng Việt để regex nhận diện ổn định với cả cách nhập có dấu và không dấu.
	const normalizedPrompt = prompt.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
	const normalizedHistory = historyText.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
	// Các từ khóa này đại diện cho ý định hỏi thời tiết hoặc số liệu thời tiết.
	const weatherIntent = /\b(thoi tiet|weather|nhiet do|mua|bao nhieu do|du bao|forecast|temperature|rain)\b/;
	// Địa điểm trong prompt mới được tìm trước để tránh địa điểm cũ trong history lấn át.
	// Ưu tiên địa điểm xuất hiện trong prompt hiện tại; không để địa điểm cũ trong history lấn át.
	const promptLocation = findKnownLocationInText(prompt);
	// Một câu chỉ có tên địa điểm, ví dụ "Seoul", được xem là tiếp tục chủ đề weather
	// khi history gần nhất đã có từ khóa thời tiết.
	// Câu chỉ nhập tên địa điểm cũng được xem là câu nối tiếp nếu history trước đó đang nói về thời tiết.
	const followUpIntent = (/\b(con|vay|the|nhu the nao|sao)\b/.test(normalizedPrompt)
		|| Boolean(promptLocation)) && weatherIntent.test(normalizedHistory);
	// Nếu prompt không có ý định weather và không phải follow-up rõ ràng, trả null để model tự trả lời.
	if (!weatherIntent.test(normalizedPrompt) && !followUpIntent) return null;

	// Chọn địa điểm mới trước; chỉ đọc history khi người dùng đang nói tiếp mà không nêu địa điểm mới.
	const location = promptLocation || findKnownLocationInText(historyText);
	if (!location) return null;

	// Chỉ suy ra forecast từ prompt hiện tại; không copy loại tool của lượt trước một cách mù quáng.
	const forecastIntent = /\b(hom nay|ngay mai|du bao|forecast|nhiet do cao nhat|nhiet do thap nhat|xac suat mua|rain)\b/.test(normalizedPrompt);
	// Trả về tool call giả lập cùng format Ollama để dùng chung luồng xử lý phía dưới.
	return {
		function: {
			name: forecastIntent ? 'get_forecast_by_address' : 'get_weather_by_address',
			arguments: { address: location.name },
		},
	};
};

const createFallbackMusicToolCall = (prompt) => {
	// Fallback music chỉ nhận những câu có động từ hành động rõ ràng như phát, nghe, mở hoặc bật.
	// Nhờ điều kiện hẹp này, câu hỏi đời thường không bị biến thành yêu cầu tìm YouTube.
	if (typeof prompt !== 'string') return null;

	// Chuẩn hóa bản không dấu để hỗ trợ cả "phat" và "phát"; regex thứ hai giữ dạng có dấu.
	const normalizedPrompt = prompt.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
	const musicVerb = /\b(phat|nghe|mo|bat)\b/.test(normalizedPrompt)
		|| /\b(phát|nghe|mở|bật)\b/iu.test(prompt);
	// Không có động từ nhạc thì để Ollama tự xử lý, không ép tool.
	if (!musicVerb) return null;

	// Bỏ phần mệnh lệnh ở đầu câu, chỉ giữ tên bài/video để YouTube search chính xác hơn.
	const query = prompt
		.replace(/^(?:cho (?:minh|toi)\s+)?(?:phát|nghe|mở|bật)\s+(?:(?:bài hát|bài|nhạc|video)\s+)?/iu, '')
		.trim();
	// Query rỗng không đủ thông tin để tìm video nên fallback phải bị hủy.
	if (!query) return null;

	// Trả về cùng hình dạng function call để dispatcher không cần biết call đến từ model hay fallback.
	return {
		function: {
			name: 'play_youtube_music',
			arguments: { query },
		},
	};
};

const callOllama = async (prompt, model = env.ollamaModel, history = []) => {
	try {
		// System message giữ luật nghiệp vụ cố định, history cung cấp ngữ cảnh, prompt mới đứng cuối.
		const messages = [
			{
				role: 'system',
				content: [
					'Bạn là trợ lý AI thân thiện, trả lời bằng tiếng Việt tự nhiên và ngắn gọn.',
					'Khi cần dữ liệu thời tiết thực tế, hãy gọi tool phù hợp thay vì tự trả lời bằng số liệu.',
					'Không tự bịa thông tin. Khi không gọi tool, trả lời trực tiếp câu hỏi bằng tối đa một câu ngắn.',
					'Khi người dùng hỏi cả thời tiết hiện tại và dự báo trong cùng một câu, bắt buộc gọi cả hai tool get_weather_by_address và get_forecast_by_address với cùng địa chỉ trước khi trả lời.',
					'Với mọi câu hỏi cần thông tin thời tiết thực tế, hãy gọi tool phù hợp; không nói rằng không có dữ liệu trước khi thử gọi tool.',
					'Nếu hỏi hôm nay, ngày mai, ngày cụ thể, dự báo, nhiệt độ cao nhất/thấp nhất hoặc xác suất mưa, dùng get_forecast_by_address.',
					'Nếu hỏi bây giờ, hiện tại hoặc lúc này, dùng get_weather_by_address. Không trộn dữ liệu hiện tại với dữ liệu dự báo thành ngày.',
					'Đưa riêng tên địa điểm vào tham số address, bỏ từ chỉ thời gian. Nếu không xác định được địa điểm thì hỏi lại người dùng.',
					'Nếu chưa có kết quả tool, trả lời tự nhiên theo câu hỏi nhưng không tự khẳng định dữ liệu thời tiết mới nhất.',
					'Khi người dùng yêu cầu phát, nghe hoặc mở bài hát/video, bắt buộc gọi play_youtube_music; không tự bịa videoId hoặc URL YouTube.',
					'Với play_youtube_music, truyền tên bài hát và nghệ sĩ vào query nếu người dùng đã cung cấp; không dùng tool này cho câu hỏi không yêu cầu phát nhạc/video.',
				].join(' '),
			},
			...normalizeHistory(history),
			{ role: 'user', content: prompt },
		];
		// Temperature 0 giúp model ít ngẫu nhiên hơn khi quyết định có gọi tool hay không.
		const request = { model, tools: toolDefinitions, stream: false, options: { temperature: 0 } };
		const url = `${env.ollamaApiUrl}/api/chat`;
		const response = await axios.post(url, { ...request, messages });
		// Fallback được tạo sau response vì chỉ cần dùng khi model không gọi đúng tool.
		const fallbackMusicToolCall = createFallbackMusicToolCall(prompt);
		const fallbackToolCall = fallbackMusicToolCall || createFallbackToolCall(prompt, history);
		// Ưu tiên tool call thật của model khi nó có trả về, vì model mạnh có thể hiểu ngữ cảnh tốt hơn regex.
		let toolCalls = response.data.message.tool_calls?.length
			? response.data.message.tool_calls
			: [fallbackToolCall].filter(Boolean);
		// Ngoại lệ: ý định nhạc rõ ràng luôn ghi đè tool model chọn nhầm do history có từ khóa thời tiết.
		if (fallbackMusicToolCall) toolCalls = [fallbackMusicToolCall];
		// Từ đây chỉ sửa weather call; music call đã được khóa ở trên và không được rewrite thành weather.
		const promptLocation = findKnownLocationInText(prompt);
		const normalizedPrompt = prompt.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
		const forecastIntent = /\b(hom nay|ngay mai|du bao|forecast|nhiet do cao nhat|nhiet do thap nhat|xac suat mua|rain)\b/.test(normalizedPrompt);
		const currentIntent = /\b(hien tai|bay gio|luc nay|current|now)\b/.test(normalizedPrompt);
		if (promptLocation && toolCalls.length > 0 && toolCalls.some((toolCall) => toolCall.function.name !== 'play_youtube_music')) {
			// Nếu prompt hiện tại có địa điểm, thay address cũ của model bằng địa điểm mới.
			// Đồng thời chọn forecast/current theo từ khóa hiện tại để không lặp nhầm loại tool.
			toolCalls = toolCalls.map((toolCall) => ({
				...toolCall,
				function: {
					...toolCall.function,
					name: forecastIntent
						? 'get_forecast_by_address'
						: currentIntent || !forecastIntent ? 'get_weather_by_address' : toolCall.function.name,
					arguments: { ...toolCall.function.arguments, address: promptLocation.name },
				},
			}));
		}
		const calledFunctions = toolCalls.map(({ function: toolFunction }) => ({
			name: toolFunction.name,
			arguments: toolFunction.arguments,
		}));

		if (toolCalls.length === 0) {
			// Không có tool nghĩa là đây là câu hỏi thông thường; trả text model và không tạo card.
			return { answer: response.data.message.content, weatherCards: [], calledFunctions };
		}

		const weatherCards = [];

		for (const toolCall of toolCalls) {
			// Dispatcher tìm handler trong registry; aiTool không cần biết service cụ thể của từng tool.
			const executedTool = await executeToolCall(toolCall);
			const name = toolCall.function.name;
			// Log tên tool sau khi quyết định cuối cùng để debug model/fallback dễ hơn.
			logger.info('Ollama gọi tool', { tool: name, model });

			if (!executedTool) {
				// Tool lạ hoặc service trả null không làm crash cả lượt chat; các card hợp lệ vẫn được giữ.
				logger.warn('Tool không lấy được dữ liệu hoặc không được đăng ký', { tool: name, model });
				continue;
			}

			// Mọi loại tool phải trả presentation.card để frontend dùng chung một pipeline render.
			weatherCards.push(executedTool.presentation.card);

		}

		const answer = weatherCards.length > 0
			? 'Mình đã cập nhật kết quả bên cạnh nhé.'
			: 'Mình đã thử tra cứu nhưng chưa lấy được dữ liệu phù hợp.';
		return {
			answer,
			weatherCards,
			calledFunctions,
		};
	} catch (error) {
		logger.error('Gọi Ollama thất bại', { model, error: error.message });
		return null;
	}
};

export { getAvailableModels, callOllama };

// Giải thích cách dùng helper:
// - getAvailableModels() gọi Ollama API /api/tags và trả về mảng tên model,
//   ví dụ ['qwen2.5:1.5b']. Nếu Ollama không gọi được thì trả về null.
// - callOllama(prompt, model) gửi câu hỏi đến Ollama API /api/chat.
//   Nếu không truyền model, hàm dùng model mặc định trong env.ollamaModel.
// - Danh sách tools cho Ollama biết có thể lấy thời tiết hiện tại hoặc dự báo 7 ngày,
//   và mỗi tool cần một tham số address.
// - Ollama đọc prompt rồi tự chọn tool phù hợp. Nếu không cần gọi tool,
//   helper trả ngay nội dung câu trả lời của Ollama.
// - Nếu Ollama chọn tool, helper lấy address từ tham số model tạo ra rồi gọi
//   getWeatherByAddress() hoặc getForecastByAddress() trong weather.js.
// - Sau khi chạy tool, helper trả lời xác nhận cố định để số liệu chỉ xuất hiện trong card.
// - callOllama() trả về { answer, weatherCards, calledFunctions }; calledFunctions
//   chứa tên và arguments của các tool Ollama yêu cầu gọi; khi lỗi thì trả về null.

// Ví dụ luồng với câu hỏi: "Thời tiết Hà Nội hiện tại?"
// 1. Ứng dụng gọi callOllama('Thời tiết Hà Nội hiện tại?'). Nếu không truyền model,
//    hàm dùng model mặc định trong env.ollamaModel.
// 2. Ollama nhận câu hỏi cùng danh sách tools và chọn get_weather_by_address,
//    với tham số address là "Hà Nội".
// 3. callOllama() đọc tool call và gọi getWeatherByAddress('Hà Nội').
// 4. Hàm service tìm tọa độ Hà Nội bằng OpenStreetMap, sau đó lấy thời tiết
//    hiện tại từ Open-Meteo. Nếu cache còn dữ liệu phù hợp thì dùng cache.
// 5. Service chuyển JSON thời tiết thành card có số liệu chính xác cho giao diện.
// 6. callOllama() trả card cùng câu xác nhận cố định; không gửi số liệu qua lượt Ollama thứ hai.