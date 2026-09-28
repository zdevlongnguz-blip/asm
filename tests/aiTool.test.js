import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import axios from 'axios';
import { env } from '../helpers/config/env.js';
import { getAvailableModels, callOllama, resolveToolCalls } from '../helpers/services/aiTool.js';

const require = createRequire(import.meta.url);
const weatherCodeMap = require('../helpers/data/weatherCodeMap.json');
const vietnamProvinces = require('../helpers/data/vietnamProvinces.json');

test('JSON tỉnh thành chỉ chứa dữ liệu tra cứu địa điểm', () => {
	for (const province of vietnamProvinces) {
		assert.equal(Object.hasOwn(province, 'localFlavor'), false, `${province.name} không còn localFlavor`);
	}
});

test('meme thời tiết theo thể thất ngôn tứ tuyệt', () => {
	const tonePatterns = [
		['B', 'B', 'T', 'T', 'T', 'B', 'B'],
		['T', 'T', 'B', 'B', 'T', 'T', 'B'],
		['T', 'T', 'B', 'B', 'B', 'T', 'T'],
		['B', 'B', 'T', 'T', 'T', 'B', 'B'],
	];
	const getTone = (word) => /[\u0301\u0309\u0303\u0323]/u.test(word.normalize('NFD')) ? 'T' : 'B';

	for (const [code, weather] of Object.entries(weatherCodeMap)) {
		const lines = weather.meme.split('\n');
		assert.equal(lines.length, 4, `Mã ${code} phải có đúng 4 câu`);
		for (const [index, line] of lines.entries()) {
			const words = line.trim().split(/\s+/);
			assert.equal(words.length, 7, `Mã ${code}, câu ${index + 1} phải có 7 tiếng`);
			assert.deepEqual(words.map(getTone), tonePatterns[index], `Mã ${code}, câu ${index + 1} sai luật bằng-trắc`);
		}
		const rhymeWords = [lines[0], lines[1], lines[3]].map((line) => line.trim().split(/\s+/).at(-1));
		assert.equal(new Set(rhymeWords).size, 3, `Mã ${code} không nên lặp nguyên chữ cuối ở các câu gieo vần`);
	}
});

test('lấy danh sách model Ollama', async (context) => {
	context.mock.method(axios, 'get', async () => ({
		data: { models: [{ name: 'qwen2.5:1.5b' }, { name: 'qwen2.5-coder:3b' }] },
	}));

	assert.deepEqual(await getAvailableModels(), ['qwen2.5:1.5b', 'qwen2.5-coder:3b']);
});

test('dùng model mặc định khi không truyền model khác', async (context) => {
	const postMock = context.mock.method(axios, 'post', async (url, body) => {
		assert.equal(body.model, env.ollamaModel);
		assert.match(body.messages[0].content, /hôm nay.*get_forecast_by_address/);
		assert.match(body.messages[0].content, /hiện tại.*get_weather_by_address/);
		assert.match(body.messages[0].content, /tối đa một câu ngắn/);
		assert.match(body.messages[0].content, /Khi cần dữ liệu thời tiết thực tế, hãy gọi tool phù hợp/);
		assert.doesNotMatch(body.messages[0].content, /localFlavor/);
		assert.match(body.messages[0].content, /cả thời tiết hiện tại và dự báo.*bắt buộc gọi cả hai tool/);
		assert.match(body.messages[0].content, /không có dữ liệu trước khi thử gọi tool/);
		assert.match(body.tools[0].function.description, /Chỉ dùng khi/);
		assert.match(body.tools[1].function.description, /Dùng khi.*hôm nay/);
		return { data: { message: { content: 'Xin chào!' } } };
	});

	assert.deepEqual(await callOllama('Xin chào'), {
		answer: 'Xin chào!',
		weatherCards: [],
		calledFunctions: [],
	});
	assert.equal(postMock.mock.callCount(), 1);
});

test('gọi tool thời tiết và trả lời xác nhận ngắn, không lặp số liệu', async (context) => {
	const address = `test-weather-${Date.now()}`;
	const weatherData = {
		current_units: {
			temperature_2m: '°C',
			relative_humidity_2m: '%',
			wind_speed_10m: 'km/h',
		},
		current: {
			temperature_2m: 25,
			relative_humidity_2m: 70,
			wind_speed_10m: 8,
			weather_code: 61,
		},
	};
	const getMock = context.mock.method(axios, 'get', async (url) => {
		if (url === env.openStreetMapUrl) {
			return { data: [{ lat: '21', lon: '105' }] };
		}
		return { data: weatherData };
	});
	let postCount = 0;
	const postMock = context.mock.method(axios, 'post', async (url, body) => {
		postCount += 1;
		if (postCount === 1) {
			return {
				data: {
					message: {
						role: 'assistant',
						tool_calls: [{
							function: {
								name: 'get_weather_by_address',
								arguments: { address },
							},
						}],
					},
				},
			};
		}
	});

	const result = await callOllama(`Thời tiết ở ${address} thế nào?`);
	assert.equal(result.answer, 'Mình đã cập nhật kết quả bên cạnh nhé.');
	assert.deepEqual(result.calledFunctions, [{
		name: 'get_weather_by_address',
		arguments: { address },
	}]);
	assert.equal(result.weatherCards[0].type, 'current');
	assert.equal(result.weatherCards[0].icon, 'bi bi-cloud-rain');
	assert.equal(result.weatherCards[0].current.temperature.value, 25);
	assert.equal(result.weatherCards[0].condition, 'Mưa nhẹ');
	assert.equal(Object.hasOwn(result.weatherCards[0], 'localFlavor'), false);
	assert.equal(getMock.mock.callCount(), 2);
	assert.equal(postMock.mock.callCount(), 1);
});

test('tạo card dự báo và không gửi lại số liệu cho lượt trả lời Ollama', async (context) => {
	const address = 'Thanh Hóa';
	const forecastData = {
		daily_units: {
			temperature_2m_max: '°C',
			temperature_2m_min: '°C',
			precipitation_probability_max: '%',
		},
		daily: {
			time: ['2026-09-28', '2026-09-29'],
			temperature_2m_max: [34.1, 33.9],
			temperature_2m_min: [24.8, 25.3],
			precipitation_probability_max: [10, 8],
			weather_code: [61, 3],
		},
	};
	context.mock.method(axios, 'get', async (url) => {
		if (url === env.openStreetMapUrl) return { data: [{ lat: '19.8', lon: '105.7' }] };
		return { data: forecastData };
	});
	let postCount = 0;
	context.mock.method(axios, 'post', async (url, body) => {
		postCount += 1;
		if (postCount === 1) {
			return {
				data: {
					message: {
						role: 'assistant',
						tool_calls: [{
							function: {
								name: 'get_forecast_by_address',
								arguments: { address },
							},
						}],
					},
				},
			};
		}
	});

	const result = await callOllama('Dự báo Thanh Hóa hôm nay', 'qwen2.5:1.5b');
	assert.equal(result.answer, 'Mình đã cập nhật kết quả bên cạnh nhé.');
	assert.equal(result.weatherCards[0].type, 'forecast');
	assert.equal(Object.hasOwn(result.weatherCards[0], 'localFlavor'), false);
	assert.equal(result.weatherCards[0].days[0].date, '2026-09-28');
	assert.equal(result.weatherCards[0].days[0].temperatureMax.value, 34.1);
	assert.equal(result.weatherCards[0].days[0].temperatureMin.value, 24.8);
	assert.equal(result.weatherCards[0].days[0].rainProbability.value, 10);
	assert.equal(result.weatherCards[0].days[1].date, '2026-09-29');
	assert.equal(result.weatherCards[0].days[1].icon, 'bi bi-clouds');
	assert.equal(postCount, 1);
});

test('xử lý cả tool thời tiết hiện tại và dự báo trong cùng câu hỏi', async (context) => {
	const address = `Sapa-${Date.now()}`;
	const getMock = context.mock.method(axios, 'get', async (url, options) => {
		if (url === env.openStreetMapUrl) return { data: [{ lat: '22.3', lon: '103.8' }] };
		if (options.params.current) {
			return {
				data: {
					current_units: { temperature_2m: '°C' },
					current: { temperature_2m: 18, weather_code: 3 },
				},
			};
		}
		return {
			data: {
				daily_units: { temperature_2m_max: '°C', temperature_2m_min: '°C' },
				daily: {
					time: ['2026-09-28'],
					temperature_2m_max: [22],
					temperature_2m_min: [15],
					weather_code: [3],
				},
			},
		};
	});
	let postCount = 0;
	const postMock = context.mock.method(axios, 'post', async () => {
		postCount += 1;
		if (postCount === 1) {
			return {
				data: {
					message: {
						role: 'assistant',
						tool_calls: [
							{ function: { name: 'get_weather_by_address', arguments: { address } } },
							{ function: { name: 'get_forecast_by_address', arguments: { address } } },
						],
					},
				},
			};
		}
		return { data: { message: { content: '' } } };
	});

	const result = await callOllama(`Thời tiết ${address} hiện tại kèm dự báo`);

	assert.equal(result.weatherCards.length, 2);
	assert.deepEqual(result.calledFunctions.map(({ name }) => name), [
		'get_weather_by_address',
		'get_forecast_by_address',
	]);
	assert.equal(result.weatherCards[0].type, 'current');
	assert.equal(result.weatherCards[1].type, 'forecast');
	assert.equal(getMock.mock.callCount(), 3);
	assert.equal(postMock.mock.callCount(), 1);
});

test('thay tool call sai hoặc lặp của model bằng địa điểm và bài hát trong prompt mới', () => {
	const prompt = 'cho tôi biết thời tiết hiện tại ở Bắc Cực, bật luôn cho tôi bài nhạc "Sao mình chưa nắm tay nhau remix"';
	const modelToolCalls = [
		{ function: { name: 'get_weather_by_address', arguments: { address: 'Hà Tĩnh' } } },
		{ function: { name: 'play_youtube_music', arguments: { query: 'Lưu niên' } } },
		{ function: { name: 'play_youtube_music', arguments: { query: 'Lưu niên' } } },
	];

	assert.deepEqual(resolveToolCalls(prompt, [], modelToolCalls), [
		{ function: { name: 'get_weather_by_address', arguments: { address: 'Bắc Cực' } } },
		{ function: { name: 'play_youtube_music', arguments: { query: 'Sao mình chưa nắm tay nhau remix' } } },
	]);
});

test('fallback gọi cả thời tiết hiện tại và dự báo khi prompt yêu cầu cả hai', () => {
	const toolCalls = resolveToolCalls('Thời tiết hiện tại và dự báo ở Bắc Cực', [], []);

	assert.deepEqual(toolCalls, [
		{ function: { name: 'get_weather_by_address', arguments: { address: 'Bắc Cực' } } },
		{ function: { name: 'get_forecast_by_address', arguments: { address: 'Bắc Cực' } } },
	]);
});

test('cho phép chọn model khác', async (context) => {
	const model = 'qwen2.5-coder:3b';
	context.mock.method(axios, 'post', async (url, body) => {
		assert.equal(body.model, model);
		return { data: { message: { content: 'Đã dùng model tùy chọn.' } } };
	});

	assert.deepEqual(await callOllama('Xin chào', model), {
		answer: 'Đã dùng model tùy chọn.',
		weatherCards: [],
		calledFunctions: [],
	});
});