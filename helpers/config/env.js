const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3000',
  openMeteoUrl: process.env.OPEN_METEO_URL || 'https://api.open-meteo.com/v1/forecast',
  openStreetMapUrl: process.env.OPEN_STREET_MAP_URL || 'https://nominatim.openstreetmap.org/search',
  // User-Agent giúp Nominatim nhận diện ứng dụng và hạn chế request bị từ chối hoặc reset kết nối.
  openStreetMapUserAgent: process.env.OPEN_STREET_MAP_USER_AGENT || 'WeatherBot/1.0 (local development)',
  ollamaApiUrl: process.env.OLLAMA_API_URL || 'http://localhost:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'llama3.2:3b',
};

export { env };
