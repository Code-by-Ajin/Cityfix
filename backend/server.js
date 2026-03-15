require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIO = require('socket.io');

const authRoutes = require('./routes/auth');
const issueRoutes = require('./routes/issues');
const ownerRoutes = require('./routes/owner');

const app = express();
const server = http.createServer(app);
const allowedOrigins = [process.env.CLIENT_URL, 'http://localhost:3000', 'http://localhost:5173'].filter(Boolean);

const io = socketIO(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }
});

// Middleware
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.set('io', io);

// Socket.IO
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

// MongoDB — soft connection (no crash if DB is down)
let dbStatus = 'connecting';
mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
})
  .then(() => { dbStatus = 'connected'; console.log('✅ MongoDB Connected'); })
  .catch(err => {
    dbStatus = 'error';
    console.error('⚠️  MongoDB connection failed:', err.message);
    console.log('ℹ️  Server still running \u2014 check MONGODB_URI in .env');
  });

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/issues', issueRoutes);
app.use('/api/owner', ownerRoutes);

// Friendly root route
app.get('/', (req, res) => {
  res.json({
    message: '🌐 CityFix Backend is running!',
    database: dbStatus,
    endpoints: { health: '/api/health', auth: '/api/auth', issues: '/api/issues', owner: '/api/owner' }
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'CityFix API running', database: dbStatus, timestamp: new Date().toISOString() });
});

// Error handler
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// 404
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`\n🌐 CityFix Backend running on http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health\n`);
});

// ✅ FIX: Handle EADDRINUSE \u2014 don't crash, show helpful message
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} is already in use!`);
    console.log(`ℹ️  To fix this, run one of these commands:`);
    console.log(`   PowerShell:  Stop-Process -Id (Get-NetTCPConnection -LocalPort ${PORT}).OwningProcess -Force`);
    console.log(`   CMD:         netstat -ano | findstr :${PORT}  then  taskkill /PID <PID> /F\n`);
    process.exit(1);
  } else {
    console.error('Server error:', err);
  }
});
