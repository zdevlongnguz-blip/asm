import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const weatherCodeMap = require('../data/weatherCodeMap.json');

const getWeatherInfo = (code) => {
	return weatherCodeMap[String(code)] || {
		description: 'Chưa rõ tình trạng thời tiết',
		meme: 'Bầu trời hôm nay đang giữ bí mật riêng.',
		icon: 'bi bi-cloud',
	};
};

const measurement = (value, unit) => ({
	value: Number.isFinite(value) ? value : null,
	unit: unit || null,
});

const createCurrentWeatherCard = (location, weatherData) => {
	const current = weatherData?.current;
	if (!current) return null;

	const info = getWeatherInfo(current.weather_code);
	const units = weatherData.current_units || {};

	return {
		// `card` là contract dành cho frontend: giữ đủ dữ liệu để Basic/Chat tự render giao diện.
		card: {
			type: 'current',
			location,
			icon: info.icon,
			condition: info.description,
			meme: info.meme,
			current: {
				temperature: measurement(current.temperature_2m, units.temperature_2m),
				humidity: measurement(current.relative_humidity_2m, units.relative_humidity_2m),
				windSpeed: measurement(current.wind_speed_10m, units.wind_speed_10m),
			},
		},
		// `context` là bản tóm tắt dữ liệu dành cho hướng mở rộng backend/AI về sau.
		// Hiện tại AI chưa đọc trường này; AI chỉ xử lý tool call hoặc trả lời hội thoại bình thường.
		// Trường này không chứa HTML và hiện cũng không được gửi trực tiếp về frontend.
		context: {
			location,
			condition: info.description,
			meme: info.meme,
			temperature: measurement(current.temperature_2m, units.temperature_2m),
			humidity: measurement(current.relative_humidity_2m, units.relative_humidity_2m),
			windSpeed: measurement(current.wind_speed_10m, units.wind_speed_10m),
		},
	};
};

const createForecastWeatherCard = (location, weatherData) => {
	const daily = weatherData?.daily;
	if (!Array.isArray(daily?.time) || daily.time.length === 0) return null;

	const units = weatherData.daily_units || {};
	const days = daily.time.map((date, index) => {
		const info = getWeatherInfo(daily.weather_code?.[index]);
		return {
			date,
			icon: info.icon,
			condition: info.description,
			temperatureMax: measurement(daily.temperature_2m_max?.[index], units.temperature_2m_max),
			temperatureMin: measurement(daily.temperature_2m_min?.[index], units.temperature_2m_min),
			rainProbability: measurement(
				daily.precipitation_probability_max?.[index],
				units.precipitation_probability_max,
			),
		};
	});
	const today = days[0];
	const firstDayInfo = getWeatherInfo(daily.weather_code?.[0]);

	return {
		// Forecast card chứa toàn bộ danh sách ngày để frontend dựng bảng/dải dự báo.
		card: {
			type: 'forecast',
			location,
			days,
		},
		// Forecast context chỉ giữ ngày đầu và các số liệu chính cho hướng mở rộng sau này.
		// Hiện tại AI chưa sử dụng context; `meme` lấy theo thời tiết ngày đầu để card dùng lại.
		context: {
			location,
			condition: today.condition,
			meme: firstDayInfo.meme,
			date: today.date,
			temperatureMax: today.temperatureMax,
			temperatureMin: today.temperatureMin,
			rainProbability: today.rainProbability,
		},
	};
};

const createWeatherCard = (location, weatherData, type) => {
	if (type === 'forecast') return createForecastWeatherCard(location, weatherData);
	return createCurrentWeatherCard(location, weatherData);
};

export { createWeatherCard };