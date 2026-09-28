import 'dotenv/config';
import express from 'express';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';

import { env } from './helpers/config/env.js';
import { logger } from './helpers/logger.js';
import indexRouter from './routes/index.js';
import usersRouter from './routes/users.js';
import aiRouter from './routes/ai.js';
import basicRouter from './routes/basic.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

logger.info('Ứng dụng khởi động', { environment: env.nodeEnv, port: env.port });

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(morgan('tiny', {
  stream: {
    write: (message) => logger.info(message.trim(), { source: 'http' }),
  },
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/basic', basicRouter);
app.use('/users', usersRouter);
app.use('/ai', aiRouter);

// 404 handler
app.use((req, res, next) => {
  res.status(404).json({ error: 'Not Found' });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Lỗi Express không được xử lý', { error: err.stack });
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
});

export default app;