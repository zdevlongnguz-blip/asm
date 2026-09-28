import { createRequire } from 'node:module';
import axios from 'axios';
import NodeCache from 'node-cache';
import { env } from '../config/env.js';
import { logger } from '../logger.js';

const require = createRequire(import.meta.url);
const vietnamProvinces = require('../data/vietnamProvinces.json');

const cache = new NodeCache({ maxKeys: 1000 });
const cacheTtl = {
	coordinates: 86400,
	weather: 600,
	forecast: 3600,
};


const normalizeAddress = (address) => {
	return address
		.trim()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/đ/g, 'd')
		.toLowerCase()
		.replace(/[.,]/g, ' ')
		.replace(/\b(tinh|thanh pho|tp|province|city|viet nam)\b/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
};

const getVietnamProvinceCoordinates = (address) => {
	const province = getVietnamProvinceByAddress(address);
	if (!province) return null;

	return { lat: province.lat, lon: province.lon };
};

const getVietnamProvinceByAddress = (address) => {
	// Từ chối dữ liệu rỗng để tránh gọi trim() trên giá trị không phải chuỗi.
	if (typeof address !== 'string' || address.trim() === '') return null;

	// Chuẩn hóa địa chỉ một lần trước khi so sánh với tên và alias trong JSON.
	const normalizedAddress = normalizeAddress(address);
	return vietnamProvinces.find((item) => {
		// Gộp tên chính với toàn bộ alias để hỗ trợ nhiều cách người dùng nhập địa điểm.
		const names = [item.name, ...item.aliases];
		// Chỉ cần một tên hoặc alias khớp hoàn toàn với địa chỉ đã chuẩn hóa.
		return names.some((name) => normalizeAddress(name) === normalizedAddress);
	});
};

const findKnownLocationInText = (text) => {
	// Hàm này nhận cả câu hỏi đầy đủ, khác với getVietnamProvinceByAddress chỉ nhận tên địa điểm riêng.
	if (typeof text !== 'string' || text.trim() === '') return null;

	// Chuẩn hóa câu hỏi để việc tìm tên không phụ thuộc dấu tiếng Việt, hoa thường hoặc dấu câu.
	const normalizedText = normalizeAddress(text);
	// Trả về địa điểm đầu tiên có tên hoặc alias xuất hiện trong câu hỏi; không tìm thấy thì trả null.
	return vietnamProvinces.find((item) => {
		const names = [item.name, ...item.aliases];
		return names.some((name) => normalizedText.includes(normalizeAddress(name)));
	}) || null;
};

//1. viết hàm lấy dữ liệu tọa độ từ tên địa chỉ bằng OpenStreetMap API
//input : address (string)
//output : {lat: number, lon: number} hoặc null nếu không tìm thấy
//ghi chú: xử lý lỗi khi gọi API, nếu có lỗi thì trả về null, có xử lý time out khi gọi API, nếu quá 5s thì trả về null
const getCoordinatesByAddress = async (address) => {
	// Không xử lý địa chỉ rỗng vì không thể tạo cache key hoặc truy vấn geocoding hợp lệ.
	if (typeof address !== 'string' || address.trim() === '') return null;

	// Cache key dùng địa chỉ đã bỏ khoảng trắng đầu cuối để các request lặp lại dùng chung tọa độ.
	const cacheKey = `coordinates:${address.trim().toLowerCase()}`;
	const cachedCoordinates = cache.get(cacheKey);
	if (cachedCoordinates) {
		// Trả cache ngay để không gọi lại JSON, OSM hoặc làm chậm request thời tiết.
		logger.info('Dùng tọa độ từ cache', { service: 'weather', operation: 'coordinates' });
		return cachedCoordinates;
	}

	// Các địa điểm đã biết được tra cục bộ trước để tránh phụ thuộc mạng và giới hạn Nominatim.
	const localCoordinates = getVietnamProvinceCoordinates(address);
	if (localCoordinates !== null) {
		// Lưu kết quả cục bộ vào cache để những lượt sau không phải tra lại JSON.
		cache.set(cacheKey, localCoordinates, cacheTtl.coordinates);
		logger.info('Dùng tọa độ địa điểm từ dữ liệu cục bộ', { service: 'weather' });
		return localCoordinates;
	}

	try {
		// Chỉ gọi OSM khi địa điểm chưa có trong dữ liệu cục bộ.
		const response = await axios.get(env.openStreetMapUrl, {
			// q là địa chỉ cần tìm; format JSON và limit 1 giúp response nhỏ, dễ xử lý.
			params: { q: address, format: 'json', limit: 1 },
			// Giới hạn 5 giây để request không treo toàn bộ luồng chat.
			timeout: 5000,
			headers: {
				// User-Agent rõ ràng là yêu cầu quan trọng khi dùng public Nominatim.
				'User-Agent': env.openStreetMapUserAgent,
				// Yêu cầu OSM trả JSON thay vì định dạng khác.
				Accept: 'application/json',
			},
		});

		if (response.data.length > 0) {
			// OSM trả lat/lon dạng chuỗi nên phải chuyển sang number trước khi gọi Open-Meteo.
			const coordinates = {
				lat: Number(response.data[0].lat),
				lon: Number(response.data[0].lon),
			};
			cache.set(cacheKey, coordinates, cacheTtl.coordinates);
			logger.info('Đã tìm thấy tọa độ bằng OpenStreetMap', { service: 'weather' });
			return coordinates;
		}
		// Response rỗng không phải exception; chuyển xuống nhánh không tìm thấy địa điểm.
		logger.warn('OpenStreetMap không tìm thấy địa chỉ, thử dữ liệu cục bộ', { service: 'weather' });
	} catch (error) {
		// Timeout, ECONNRESET hoặc lỗi mạng đều được ghi log rồi trả null thay vì làm crash server.
		logger.error('Lỗi OpenStreetMap, thử dữ liệu cục bộ', { service: 'weather', error: error.message });
	}

	logger.warn('Không tìm thấy địa chỉ trên API hoặc dữ liệu cục bộ', { service: 'weather' });
	return null;
};

//2. viết hàm lấy dữ liệu thời tiết từ OpenMeteo API
//input : lat (number), lon (number)
//output : dữ liệu thời tiết dạng JSON hoặc null nếu không tìm thấy
//ghi chú: xử lý lỗi khi gọi API, nếu có lỗi thì trả về null, có xử lý time out khi gọi API, nếu quá 5s thì trả về null
const getWeatherByCoordinates = async (lat, lon) => {
	const cacheKey = `weather:${lat}:${lon}`;
	const cachedWeather = cache.get(cacheKey);
	if (cachedWeather) {
		logger.info('Dùng thời tiết từ cache', { service: 'weather', operation: 'current' });
		return cachedWeather;
	}

	try {
		const response = await axios.get(env.openMeteoUrl, {
			params: {
				latitude: lat,
				longitude: lon,
				current: 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m',
			},
			timeout: 5000,
		});

		cache.set(cacheKey, response.data, cacheTtl.weather);
		logger.info('Đã lấy thời tiết hiện tại', { service: 'weather' });
		return response.data;
	} catch (error) {
		logger.error('Lỗi khi lấy thời tiết hiện tại', { service: 'weather', error: error.message });
		return null;
	}
};

// Hàm trả về toàn bộ JSON từ Open-Meteo, gồm:
// - latitude, longitude: tọa độ địa điểm.
// - timezone, timezone_abbreviation, utc_offset_seconds: thông tin múi giờ.
// - elevation: độ cao địa điểm tính bằng mét.
// - current_units: đơn vị đo của các dữ liệu thời tiết.
// - current: thời điểm đo, nhiệt độ, độ ẩm, mã thời tiết và tốc độ gió.
// Nếu API lỗi hoặc quá 5 giây thì hàm trả về null.

// Lấy dự báo thời tiết 7 ngày từ tọa độ.
//output : dữ liệu dự báo dạng JSON hoặc null nếu có lỗi
const getForecastByCoordinates = async (lat, lon) => {
	const cacheKey = `forecast:${lat}:${lon}`;
	const cachedForecast = cache.get(cacheKey);
	if (cachedForecast) {
		logger.info('Dùng dự báo từ cache', { service: 'weather', operation: 'forecast' });
		return cachedForecast;
	}

	try {
		const response = await axios.get(env.openMeteoUrl, {
			params: {
				latitude: lat,
				longitude: lon,
				daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code',
				forecast_days: 7,
				timezone: 'auto',
			},
			timeout: 5000,
		});

		cache.set(cacheKey, response.data, cacheTtl.forecast);
		logger.info('Đã lấy dự báo thời tiết', { service: 'weather' });
		return response.data;
	} catch (error) {
		logger.error('Lỗi khi lấy dự báo thời tiết', { service: 'weather', error: error.message });
		return null;
	}
};

// Hàm trả về toàn bộ JSON dự báo từ Open-Meteo, gồm:
// - latitude, longitude: tọa độ địa điểm.
// - timezone, timezone_abbreviation, utc_offset_seconds: thông tin múi giờ.
// - elevation: độ cao địa điểm tính bằng mét.
// - daily_units: đơn vị đo của các dữ liệu dự báo.
// - daily.time: ngày dự báo.
// - daily.temperature_2m_max, temperature_2m_min: nhiệt độ cao nhất và thấp nhất.
// - daily.precipitation_probability_max: xác suất mưa cao nhất trong ngày.
// - daily.weather_code: mã mô tả thời tiết.
// Nếu API lỗi hoặc quá 5 giây thì hàm trả về null.

//3. viết hàm lấy dữ liệu thời tiết từ tên địa chỉ
//input : address (string)
//output : dữ liệu thời tiết dạng JSON hoặc null nếu không tìm thấy
//ghi chú: sử dụng 2 hàm trên để lấy dữ liệu thời tiết từ tên địa chỉ, nếu không tìm thấy địa chỉ hoặc thời tiết thì trả về null
const getWeatherByAddress = async (address) => {
	const coordinates = await getCoordinatesByAddress(address);
	if (coordinates === null) return null;

	return getWeatherByCoordinates(coordinates.lat, coordinates.lon);
};

// Lấy dự báo thời tiết theo địa chỉ bằng cách tìm tọa độ trước.
const getForecastByAddress = async (address) => {
	const coordinates = await getCoordinatesByAddress(address);
	if (coordinates === null) return null;

	return getForecastByCoordinates(coordinates.lat, coordinates.lon);
};


// const test = async () => {
//     const address = 'Hà Nội';
//     const coordinates = await getCoordinatesByAddress(address);
//     console.log('Coordinates:', coordinates);
//     const weather = await getWeatherByCoordinates(coordinates.lat, coordinates.lon);
//     console.log('Weather:', weather);
// };

// test();

export {
	getVietnamProvinceCoordinates,
	getVietnamProvinceByAddress,
	findKnownLocationInText,
	getCoordinatesByAddress,
	getWeatherByCoordinates,
	getWeatherByAddress,
	getForecastByCoordinates,
	getForecastByAddress,
};

// Giải thích cache:
// - NodeCache lưu dữ liệu tạm trong bộ nhớ của tiến trình Node.js hiện tại.
// - cacheKey là tên riêng để phân biệt từng loại dữ liệu và từng địa điểm.
// - Trước khi gọi API, hàm dùng cache.get(cacheKey) để tìm dữ liệu đã lưu.
// - Nếu tìm thấy, hàm trả dữ liệu đó ngay và không gửi request mới.
// - Nếu không tìm thấy hoặc dữ liệu đã hết hạn, hàm gọi API như bình thường.
// - Sau khi API trả kết quả thành công, cache.set() lưu kết quả cùng thời hạn TTL.
// - TTL được tính bằng giây: coordinates = 86400 giây (1 ngày),
//   weather = 600 giây (10 phút), forecast = 3600 giây (1 giờ).
// - Cache tọa độ dùng địa chỉ đã trim khoảng trắng đầu/cuối và chuyển thành chữ thường,
//   nên ví dụ "Hà Nội" và " hà nội " dùng chung một key.
// - Cache thời tiết hiện tại và dự báo dùng tọa độ; tiền tố weather/forecast
//   giúp hai loại dữ liệu không dùng nhầm cache của nhau.
// - Kết quả null, lỗi API và địa chỉ không tìm thấy không được lưu vào cache.
// - Các hàm theo địa chỉ gọi lại hàm lấy tọa độ và hàm thời tiết/dự báo,
//   vì vậy chúng tự sử dụng các cache tương ứng, không cần cache thêm một lần nữa.
// - maxKeys: 1000 giới hạn số mục cache. Cache không chia sẻ giữa nhiều tiến trình
//   và toàn bộ dữ liệu sẽ mất khi tiến trình Node.js khởi động lại.