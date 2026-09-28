import axios from 'axios';
import { env } from '../config/env.js';
import { logger } from '../logger.js';
import { findKnownLocationInText } from './weather.js';
import { toolDefinitions, executeToolCall } from './toolRegistry.js';

const getAvailableModels = async () => {
	try {
		// /api/tags của Ollama trả về các model đang được cài trên máy chạy service.
		const response = await axios.get(`${env.ollamaApiUrl}/api/tags`);
		// Chỉ lấy tên model để route/UI không phụ thuộc vào cấu trúc response đầy đủ của Ollama.
		return response.data.models.map((model) => model.name);
	} catch (error) {
		// Lỗi mạng hoặc Ollama chưa chạy được chuyển thành null để caller tự quyết định cách báo lỗi.
		logger.error('Không thể lấy danh sách model Ollama', { error: error.message });
		return null;
	}
};

// Chuyển lịch sử do trình duyệt gửi sang cấu trúc messages mà Ollama yêu cầu.
const normalizeHistory = (history) => (Array.isArray(history) ? history : [])
	// Nếu history sai kiểu, dùng mảng rỗng; nếu đúng kiểu thì tiếp tục lọc từng message.
	// Chỉ nhận message do giao diện tạo; loại bỏ role lạ để client không chèn system message.
	.filter((entry) => ['user', 'bot'].includes(entry?.role) && typeof entry.text === 'string')
	// Dùng tối đa 12 tin nhắn gần nhất, không gửi cả cuộc hội thoại dài vô hạn cho model.
	// Giữ tối đa 12 message gần nhất, tương đương khoảng 6 cặp user/assistant.
	.slice(-12)
	// Tạo object mới thay vì gửi nguyên object từ client, chỉ giữ hai trường Ollama cần.
	.map((entry) => ({
		// Ollama dùng assistant, còn frontend đặt tên vai trò phản hồi là bot.
		role: entry.role === 'bot' ? 'assistant' : 'user',
		// Giới hạn độ dài mỗi message để history không chiếm hết context của model.
		content: entry.text.slice(0, 2000),
	}));

const createFallbackToolCall = (prompt, history) => {
	// Hàm chỉ nhận diện ý định và dựng tool call; việc gọi API xảy ra sau đó trong executeToolCall().
	// Ghép text history để hiểu các câu nối tiếp như "còn ở đó thì sao?".
	const historyText = Array.isArray(history) ? history.map((entry) => entry?.text || '').join(' ') : '';
	// Chuẩn hóa prompt hiện tại riêng để các quyết định về thời tiết/dự báo không bị history cũ chi phối.
	const normalizedPrompt = prompt.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
	// Chuẩn hóa history chỉ để nhận biết chủ đề trước đó khi prompt hiện tại là câu nối tiếp.
	const normalizedHistory = historyText.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
	// Những cụm từ này là tín hiệu rằng người dùng cần dữ liệu thời tiết thực tế.
	const weatherIntent = /\b(thoi tiet|weather|nhiet do|mua|bao nhieu do|du bao|forecast|temperature|rain)\b/;
	// Tìm địa điểm trong câu mới trước; hàm trả null nếu câu không chứa tên/alias đã biết.
	const promptLocation = findKnownLocationInText(prompt);
	// Cho phép câu nối tiếp khi có từ nối hoặc địa điểm, nhưng chỉ nếu history đang nói về thời tiết.
	const followUpIntent = (/\b(con|vay|the|nhu the nao|sao)\b/.test(normalizedPrompt)
		|| Boolean(promptLocation)) && weatherIntent.test(normalizedHistory);
	// Không nhận diện được ý định thời tiết thì để model tự trả lời, không ép gọi tool.
	if (!weatherIntent.test(normalizedPrompt) && !followUpIntent) return null;

	// Địa điểm trong prompt luôn thắng; chỉ mượn địa điểm cũ nếu đây là câu nối tiếp không nêu địa điểm.
	const location = promptLocation || findKnownLocationInText(historyText);
	// Không có địa điểm trong prompt/history thì không thể tạo arguments hợp lệ cho tool thời tiết.
	if (!location) return null;

	// Chỉ suy ra loại dữ liệu từ prompt mới để không lặp nhầm current/forecast của lượt trước.
	const forecastIntent = /\b(hom nay|ngay mai|du bao|forecast|nhiet do cao nhat|nhiet do thap nhat|xac suat mua|rain)\b/.test(normalizedPrompt);
	// Trả về cùng cấu trúc với function call của Ollama để các bước sau chỉ cần một format.
	return {
		function: {
			name: forecastIntent ? 'get_forecast_by_address' : 'get_weather_by_address',
			arguments: { address: location.name },
		},
	};
};

const createFallbackMusicToolCall = (prompt) => {
	// Chỉ tạo fallback khi câu có yêu cầu hành động rõ ràng; không biến câu nhắc tên bài hát thành lệnh phát.
	if (typeof prompt !== 'string') return null;

	// Bản không dấu bắt được cách gõ không dấu; regex có dấu giữ nguyên các động từ tiếng Việt.
	const normalizedPrompt = prompt.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
	const musicVerb = /\b(phat|nghe|mo|bat)\b/.test(normalizedPrompt)
		|| /\b(phát|nghe|mở|bật)\b/iu.test(prompt);
	// Không có động từ phát/nghe/mở/bật thì không coi đây là yêu cầu YouTube.
	if (!musicVerb) return null;

	// Tìm động từ ở bất kỳ vị trí nào vì một câu có thể yêu cầu nhiều việc; ví dụ:
	// "cho tôi biết thời tiết hiện tại ở Bắc Cực, bật luôn cho tôi bài nhạc 'Sao mình chưa...'"
	const musicMatch = prompt.match(/(?:phat|nghe|mo|bat|phát|nghe|mở|bật)/iu);
	// Phòng vệ: nếu regex nhận diện phía trên thay đổi mà không còn vị trí khớp thì hủy fallback.
	if (!musicMatch) return null;

	// Cắt bỏ toàn bộ phần trước và gồm động từ; phần còn lại thường chứa tên bài/video cần tìm.
	let query = prompt.slice(musicMatch.index + musicMatch[0].length).trim();
	query = query
		// Loại các từ mệnh lệnh/từ loại như "luôn cho tôi bài nhạc" ở đầu query.
		.replace(/^(?:luon|luôn)?\s*(?:cho\s+(?:minh|toi|tôi)\s+)?(?:bài\s+(?:hát|nhạc)?|nhạc|video|ca\s+khúc|playlist)\s*/iu, '')
		// Nếu câu có dạng "bật nhạc tôi thích" thì bỏ đại từ xưng hô thừa ở đầu.
		.replace(/^(?:minh|toi|tôi)\s+/iu, '')
		// Bỏ riêng từ "nhạc" còn sót lại sau các dạng mệnh lệnh ít phổ biến.
		.replace(/^nhạc\s+/iu, '')
		// Bỏ dấu câu/ký tự trích dẫn ở đầu để query bắt đầu bằng tên bài.
		.replace(/^[\s'"\-–:;,.]+/, '')
		// Bỏ dấu nháy bao quanh tên bài, ví dụ "Tên bài hát".
		.replace(/^['"]+|['"]+$/g, '')
		// Bỏ dấu câu/khoảng trắng thừa ở cuối query.
		.replace(/[\s'"\-–:;,.]+$/u, '');
	// Không gửi truy vấn rỗng đến YouTube vì không thể tìm được kết quả có ý nghĩa.
	if (!query) return null;

	// Dùng cùng schema tool của Ollama để resolver/dispatcher không phân biệt nguồn tạo call.
	return {
		function: {
			name: 'play_youtube_music',
			arguments: { query },
		},
	};
};

const createFallbackToolCalls = (prompt, history) => {
	// Mảng này có thể chứa weather, music hoặc cả hai nếu prompt yêu cầu nhiều việc.
	const toolCalls = [];
	// Tạo fallback thời tiết trước; hàm trả một tool nếu câu chỉ hỏi một loại dữ liệu.
	const fallbackToolCall = createFallbackToolCall(prompt, history);
	if (fallbackToolCall) {
		// Dùng cùng cách chuẩn hóa/từ khóa của parser để phát hiện câu yêu cầu cả current lẫn forecast.
		const normalizedPrompt = prompt.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
		const currentIntent = /\b(hien tai|bay gio|luc nay|current|now)\b/.test(normalizedPrompt);
		const forecastIntent = /\b(hom nay|ngay mai|du bao|forecast|nhiet do cao nhat|nhiet do thap nhat|xac suat mua|rain)\b/.test(normalizedPrompt);

		if (currentIntent && forecastIntent) {
			// Cả hai ý định cùng có mặt: dùng chung địa chỉ nhưng tạo hai function call riêng.
			const { address } = fallbackToolCall.function.arguments;
			toolCalls.push(
				{ function: { name: 'get_weather_by_address', arguments: { address } } },
				{ function: { name: 'get_forecast_by_address', arguments: { address } } },
			);
		} else {
			// Chỉ có một loại ý định thì giữ tool call current hoặc forecast đã được parser chọn.
			toolCalls.push(fallbackToolCall);
		}
	}

	// Tách fallback nhạc khỏi weather để một prompt ghép có thể gọi đồng thời cả hai dịch vụ.
	const fallbackMusicToolCall = createFallbackMusicToolCall(prompt);
	if (fallbackMusicToolCall) toolCalls.push(fallbackMusicToolCall);

	// Trả về danh sách rỗng nếu prompt không có ý định nào đủ rõ để tạo fallback.
	return toolCalls;
};

const resolveToolCalls = (prompt, history, modelToolCalls = []) => {
	// Sao chép mảng của model để không sửa trực tiếp response object do SDK/HTTP client trả về.
	const toolCalls = [...modelToolCalls];
	// Fallback được tạo từ prompt hiện tại; nếu model đoán cùng tool thì fallback sẽ thay arguments cũ.
	for (const fallbackToolCall of createFallbackToolCalls(prompt, history)) {
		// Khi prompt đã nêu rõ ý định, thay dự đoán cùng loại của model để không giữ tham số cũ.
		// Duyệt ngược để splice không làm lệch vị trí các phần tử chưa kiểm tra.
		for (let index = toolCalls.length - 1; index >= 0; index -= 1) {
			// So sánh tên tool, không so arguments: khác arguments chính là trường hợp cần sửa.
			if (toolCalls[index]?.function?.name === fallbackToolCall.function.name) {
				toolCalls.splice(index, 1);
			}
		}
		// Thêm bản fallback đã được dựng từ prompt mới vào cuối danh sách.
		toolCalls.push(fallbackToolCall);
	}

	// Chỉ dùng địa điểm được nêu trong câu hiện tại để chuẩn hóa weather calls.
	const promptLocation = findKnownLocationInText(prompt);
	// Bỏ dấu và chuyển chữ thường để regex hoạt động đồng nhất với tiếng Việt có/không dấu.
	const normalizedPrompt = prompt.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
	// Phân loại riêng forecast/current; nếu cả hai đúng thì không ép loại tool này thành loại kia.
	const forecastIntent = /\b(hom nay|ngay mai|du bao|forecast|nhiet do cao nhat|nhiet do thap nhat|xac suat mua|rain)\b/.test(normalizedPrompt);
	const currentIntent = /\b(hien tai|bay gio|luc nay|current|now)\b/.test(normalizedPrompt);
	const combinedWeatherIntent = forecastIntent && currentIntent;
	// Chỉ hai tên tool này nhận arguments.address; music và tool lạ phải được giữ nguyên.
	const weatherToolNames = new Set(['get_weather_by_address', 'get_forecast_by_address']);
	// Mặc định giữ nguyên các call; chỉ tạo mảng đã sửa khi prompt có địa điểm rõ ràng.
	let resolvedToolCalls = toolCalls;

	// Không sửa địa chỉ lấy từ history/model nếu prompt hiện tại nêu một địa điểm đã biết.
	if (promptLocation && toolCalls.some((toolCall) => weatherToolNames.has(toolCall?.function?.name))) {
		resolvedToolCalls = toolCalls.map((toolCall) => {
			const toolName = toolCall?.function?.name;
			// Không chạm tới YouTube hoặc tool không thuộc nhóm thời tiết.
			if (!weatherToolNames.has(toolName)) return toolCall;

			return {
				...toolCall,
				function: {
					...toolCall.function,
					// Với câu hỏi ghép, giữ current và forecast thành hai tool riêng.
					// Với câu hỏi đơn, ép loại tool theo ý định rõ trong prompt hiện tại.
					name: combinedWeatherIntent
						? toolName
						: forecastIntent
							? 'get_forecast_by_address'
							: currentIntent ? 'get_weather_by_address' : toolName,
					// Giữ các argument khác của model nhưng luôn thay address bằng địa điểm hiện tại.
					arguments: { ...toolCall.function.arguments, address: promptLocation.name },
				},
			};
		});
	}

	// Khử call trùng sau khi sửa tên/address; JSON signature gồm cả tên và arguments của tool.
	return resolvedToolCalls.filter((toolCall, index, calls) => {
		// Cùng tool nhưng arguments khác nhau vẫn được giữ vì có thể là hai yêu cầu riêng.
		const signature = JSON.stringify([
			toolCall?.function?.name,
			toolCall?.function?.arguments || {},
		]);
		// Chỉ giữ lần xuất hiện đầu tiên của signature này.
		return calls.findIndex((candidate) => JSON.stringify([
			candidate?.function?.name,
			candidate?.function?.arguments || {},
		]) === signature) === index;
	});
};

const callOllama = async (prompt, model = env.ollamaModel, history = []) => {
	try {
		// Tạo toàn bộ hội thoại theo thứ tự: luật cố định, history đã lọc, rồi prompt mới nhất.
		const messages = [
			{
				role: 'system',
				// Các quy tắc này hướng model chọn tool; resolver vẫn kiểm tra lại các intent rõ bằng code.
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
			// Chèn history sau system để role do client gửi không thể ghi đè luật của ứng dụng.
			...normalizeHistory(history),
			// Prompt hiện tại luôn đứng cuối để model trả lời yêu cầu mới nhất.
			{ role: 'user', content: prompt },
		];
		// Temperature 0 giảm biến thiên khi model chọn tool; đây không thay thế bước validate phía dưới.
		const request = { model, tools: toolDefinitions, stream: false, options: { temperature: 0 } };
		// Tạo endpoint chat từ base URL cấu hình, không hard-code host trong hàm.
		const url = `${env.ollamaApiUrl}/api/chat`;
		// Chờ phản hồi đầy đủ vì route cần tool_calls trước khi quyết định gọi các service nghiệp vụ.
		const response = await axios.post(url, { ...request, messages });
		// Sửa arguments cũ, bổ sung fallback rõ ràng và khử tool call trùng.
		const toolCalls = resolveToolCalls(prompt, history, response.data.message.tool_calls || []);
		// Chuẩn hóa danh sách tool cho response công khai; giữ đúng tên và arguments cuối cùng.
		const calledFunctions = toolCalls.map(({ function: toolFunction }) => ({
			name: toolFunction.name,
			arguments: toolFunction.arguments,
		}));

		if (toolCalls.length === 0) {
			// Không có tool phù hợp: trả văn bản model và để frontend không hiển thị card công cụ.
			return { answer: response.data.message.content, weatherCards: [], calledFunctions };
		}

		// Tên mảng được giữ theo contract route dù nó chứa card thời tiết hoặc YouTube.
		const weatherCards = [];

		// Thực thi tuần tự để tránh gọi đồng thời nhiều lần cùng geocoding/API và dễ cô lập lỗi từng tool.
		for (const toolCall of toolCalls) {
			// Dispatcher tìm handler trong registry; aiTool không cần biết service cụ thể của từng tool.
			const executedTool = await executeToolCall(toolCall);
			const name = toolCall.function.name;
			// Ghi log sau khi resolver đã chọn arguments cuối cùng để dễ đối chiếu với kết quả.
			logger.info('Ollama gọi tool', { tool: name, model });

			if (!executedTool) {
				// Một tool lỗi/không tồn tại không làm mất card từ các tool khác trong cùng yêu cầu.
				// Tool lạ hoặc service trả null không làm crash cả lượt chat; các card hợp lệ vẫn được giữ.
				logger.warn('Tool không lấy được dữ liệu hoặc không được đăng ký', { tool: name, model });
				continue;
			}

			// Registry chuẩn hóa kết quả vào presentation.card để frontend render mọi tool cùng pipeline.
			weatherCards.push(executedTool.presentation.card);

		}

		// Có ít nhất một card thì dùng câu xác nhận cố định; không gọi Ollama lần hai để diễn đạt số liệu.
		const answer = weatherCards.length > 0
			? 'Mình đã cập nhật kết quả bên cạnh nhé.'
			: 'Mình đã thử tra cứu nhưng chưa lấy được dữ liệu phù hợp.';
		// Giữ contract mà route/frontend đang dùng: câu trả lời, cards, và danh sách tool thực tế đã chọn.
		return {
			answer,
			weatherCards,
			calledFunctions,
		};
	} catch (error) {
		// Lỗi request hoặc response sai cấu trúc được log và chuyển thành null để route trả HTTP 502.
		logger.error('Gọi Ollama thất bại', { model, error: error.message });
		return null;
	}
};

// Expose API chính và resolver thuần để test logic tool call mà không cần gọi Ollama.
export { getAvailableModels, callOllama, resolveToolCalls };

// Tóm tắt contract và luồng để tra cứu nhanh khi dùng helper ở route:
// - getAvailableModels() gọi Ollama API /api/tags và trả về mảng tên model,
//   ví dụ ['qwen2.5:1.5b']. Nếu Ollama không gọi được thì trả về null.
// - callOllama(prompt, model, history) gửi system rules, history đã chuẩn hóa và prompt đến /api/chat.
//   Bỏ model thì dùng env.ollamaModel; history là tùy chọn và chỉ giữ tối đa 12 message hợp lệ.
// - toolDefinitions mô tả current weather, forecast và YouTube; toolRegistry chứa handler thực thi.
// - resolveToolCalls() sửa các arguments xung đột với prompt hiện tại, tạo fallback intent rõ,
//   hỗ trợ đồng thời current + forecast, rồi loại các tool call trùng.
// - executeToolCall() gọi handler; kết quả hợp lệ được chuyển thành card cho frontend.
// - Response giữ dạng { answer, weatherCards, calledFunctions }; khi xảy ra lỗi Ollama trả null.

// Ví dụ luồng với câu hỏi: "Thời tiết Hà Nội hiện tại?"
// 1. Ứng dụng gọi callOllama('Thời tiết Hà Nội hiện tại?'). Nếu không truyền model,
//    hàm dùng model mặc định trong env.ollamaModel.
// 2. Ollama nhận câu hỏi cùng danh sách tools và thường chọn get_weather_by_address,
//    với tham số address là "Hà Nội"; resolver kiểm tra lại địa điểm theo prompt hiện tại.
// 3. callOllama() chuyển tool call đã chuẩn hóa qua registry để gọi service thời tiết.
// 4. Hàm service tìm tọa độ Hà Nội bằng OpenStreetMap, sau đó lấy thời tiết
//    hiện tại từ Open-Meteo. Nếu cache còn dữ liệu phù hợp thì dùng cache.
// 5. Service chuyển JSON thời tiết thành card có số liệu chính xác cho giao diện.
// 6. Nếu model bỏ sót tool nhưng ý định rõ, fallback tạo tool call; kết quả trả về không gọi Ollama lần hai.