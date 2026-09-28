import axios from 'axios';
import { env } from '../config/env.js';

const api = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export { api };
