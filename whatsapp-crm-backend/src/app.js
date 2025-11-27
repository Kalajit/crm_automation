const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const session = require('express-session');
const routes = require('./routes');
const { errorHandler } = require('./middleware/error.middleware');
const { rateLimiter } = require('./middleware/rateLimit.middleware');

const app = express();

// ============================================
// MIDDLEWARE
// ============================================

// Security
app.use(helmet());

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:8501', 'https://*.ngrok-free.app'],
  credentials: true
}));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

// Rate limiting
app.use(rateLimiter);

// Session management
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-super-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 3600000 // 1 hour
  }
}));

// ============================================
// ROUTES
// ============================================

app.use('/api', routes);

// Health check endpoints
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString() 
  });
});

// ============================================
// ERROR HANDLING
// ============================================

app.use(errorHandler);

module.exports = app;