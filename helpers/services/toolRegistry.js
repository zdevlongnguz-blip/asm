import {
	getWeatherByAddress,
	getForecastByAddress,
} from './weather.js';
import { createWeatherCard } from './weatherCard.js';
import { createYoutubeCard } from './youtube.js';

// Registry là nguồn duy nhất mô tả các tool mà Ollama được phép gọi.
const toolRegistry = {
	get_weather_by_address: {
		// Schema này được gửi cho Ollama để model biết khi nào và với tham số nào tool được dùng.
		definition: {
			type: 'function',
			function: {
				name: 'get_weather_by_address',
				description: 'Lấy thời tiết tại thời điểm hiện tại. Chỉ dùng khi người dùng hỏi "bây giờ", "hiện tại" hoặc "lúc này". Không dùng cho câu hỏi về hôm nay hoặc dự báo.',
				parameters: {
					type: 'object',
					properties: {
						address: { type: 'string', description: 'Chỉ ghi tên địa điểm, ví dụ Thanh Hóa; bỏ các từ chỉ thời gian.' },
					},
					required: ['address'],
				},
			},
		},
		// Handler gọi service thời tiết hiện tại rồi chuyển response thành card chung của frontend.
		execute: async (argumentsObject) => {
			const weatherData = await getWeatherByAddress(argumentsObject.address);
			return weatherData ? createWeatherCard(argumentsObject.address, weatherData, 'current') : null;
		},
	},
	get_forecast_by_address: {
		// Schema forecast tách riêng khỏi current để model không trộn dữ liệu hiện tại và dự báo.
		definition: {
			type: 'function',
			function: {
				name: 'get_forecast_by_address',
				description: 'Lấy dự báo thời tiết 7 ngày theo địa chỉ. Dùng khi người dùng hỏi "hôm nay", "ngày mai", ngày cụ thể, "dự báo", nhiệt độ cao nhất/thấp nhất hoặc xác suất mưa. Dữ liệu có ngày, nhiệt độ cao/thấp (°C) và xác suất mưa cao nhất (%).',
				parameters: {
					type: 'object',
					properties: {
						address: { type: 'string', description: 'Chỉ ghi tên địa điểm, ví dụ Thanh Hóa; bỏ các từ chỉ thời gian.' },
					},
					required: ['address'],
				},
			},
		},
		// Handler forecast có cùng contract card nhưng dùng renderer forecast.
		execute: async (argumentsObject) => {
			const forecastData = await getForecastByAddress(argumentsObject.address);
			return forecastData ? createWeatherCard(argumentsObject.address, forecastData, 'forecast') : null;
		},
	},
	play_youtube_music: {
		// Schema nhạc chỉ nhận query; videoId không được model tự bịa mà do backend tìm và kiểm tra.
		definition: {
			type: 'function',
			function: {
				name: 'play_youtube_music',
				description: 'Phát hoặc tìm một bài hát trên YouTube bằng thẻ video nhúng. Chỉ dùng khi người dùng yêu cầu nghe, phát hoặc mở nhạc/video. Query phải gồm tên bài hát và nghệ sĩ nếu người dùng cung cấp.',
				parameters: {
					type: 'object',
					properties: {
						query: {
							type: 'string',
							description: 'Tên bài hát hoặc video cần tìm trên YouTube, tối đa 120 ký tự; không thêm lời giải thích.',
						},
					},
					required: ['query'],
				},
			},
		},
		// Handler YouTube tìm video thật và trả card có embedUrl cùng videoId đã validate.
		execute: async (argumentsObject) => createYoutubeCard(argumentsObject.query),
	},
};

// Chỉ gửi phần definition ra ngoài; handler nội bộ không cần xuất hiện trong payload Ollama.
const toolDefinitions = Object.values(toolRegistry).map(({ definition }) => definition);

// Dispatcher biến tool call động thành một lời gọi handler đã đăng ký, không cần chuỗi if dài trong aiTool.
const executeToolCall = async (toolCall) => {
	const name = toolCall?.function?.name;
	const registeredTool = toolRegistry[name];
	if (!registeredTool) return null;

	const argumentsObject = toolCall.function.arguments || {};
	const presentation = await registeredTool.execute(argumentsObject);
	if (!presentation) return null;

	return {
		name,
		arguments: argumentsObject,
		presentation,
	};
};

export { toolDefinitions, executeToolCall };
