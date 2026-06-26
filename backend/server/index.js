require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { getDatabaseStatus, initializeDatabase } = require('./db');

const app = express();
const PORT = process.env.PORT || 8000;
const corsOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

// Middleware
app.use(helmet());
app.use(morgan('combined'));
app.use(
    cors(
        corsOrigins.length > 0
            ? {
                  origin(origin, callback) {
                      if (!origin || corsOrigins.includes(origin)) {
                          callback(null, true);
                          return;
                      }
                      callback(new Error(`Origin ${origin} is not allowed by CORS`));
                  },
              }
            : undefined
    )
);
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
    const database = getDatabaseStatus();
    const statusCode = database.ready || !database.configured ? 200 : 503;

    res.status(statusCode).json({
        status: database.ready || !database.configured ? 'OK' : 'DEGRADED',
        message: database.ready
            ? 'API server is running.'
            : database.configured
              ? 'API server is running, but the database is unavailable.'
              : 'API server is running without a configured database.',
        database,
    });
});

// Routes
app.use('/api/bot-ideas', require('./routes/bot-ideas'));
app.use('/api/best-bot-stats', require('./routes/best-bot-stats'));
app.use('/api/scanner', require('./routes/scanner'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/exchange-rates', require('./routes/exchange-rates'));
app.use('/api/competitions', require('./routes/competitions'));

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Initialize database and start server
async function start() {
    await initializeDatabase();

    app.listen(PORT, '0.0.0.0', () => {
        const database = getDatabaseStatus();
        const databaseState = database.ready
            ? 'connected'
            : database.configured
              ? `unavailable (${database.error})`
              : 'not configured';

        console.log(`API server running on http://0.0.0.0:${PORT} with database ${databaseState}`);
    });
}

start();

module.exports = app;
