const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const session = require('express-session');
const routes = require('./routes');
const { errorHandler } = require('./middleware/error.middleware');
const { rateLimiter } = require('./middleware/rateLimit.middleware');
const { apiRateLimiter } = require('./middleware/rateLimiter.middleware');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const app = express();

app.set('trust proxy', true);

// Import schedulers
const { initializeSchedulers } = require('./jobs');

// ============================================
// MIDDLEWARE
// ============================================

// Security
app.use(helmet());

// CORS
// app.use(cors({
//   origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:8501', 'https://*.ngrok-free.app'],
//   credentials: true
// }));

// CORS - Fix for ngrok + frontend
app.use(cors({
  origin: true,  // Reflects the request origin (allows null, localhost, ngrok, etc.)
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning', 'x-requested-with'],
  exposedHeaders: ['Content-Length'],
  optionsSuccessStatus: 204
}));

// Handle preflight for all routes
app.options('*', cors()); // This ensures OPTIONS requests get proper CORS headers

// Body parsing
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('combined'));

// Rate limiting
// app.use(rateLimiter);


// Session management
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-super-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 3600000 // 1 hour
  }
}));

// // Rate limiting
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 100 // limit each IP to 100 requests per windowMs
// });
// app.use('/api/', limiter);


// Apply rate limiting to all API routes
app.use('/api/', apiRateLimiter);

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

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.path
  });
});

// ============================================
// ERROR HANDLING
// ============================================

app.use(errorHandler);

module.exports = app;