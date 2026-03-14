const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware to verify JWT token for regular users
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No authentication token' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.role === 'owner') {
      req.isOwner = true;
      req.ownerEmail = decoded.email;
      return next();
    }

    const user = await User.findById(decoded.id).select('-password');
    if (!user) return res.status(401).json({ error: 'User not found' });

    req.user = user;
    req.userId = user._id;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// Owner-only middleware
const ownerAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No authentication token' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'owner') return res.status(403).json({ error: 'Owner access required' });

    req.isOwner = true;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// Optional auth - continues even without valid token
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.role !== 'owner') {
        const user = await User.findById(decoded.id).select('-password');
        if (user) {
          req.user = user;
          req.userId = user._id;
        }
      }
    }
    next();
  } catch (error) {
    next();
  }
};

module.exports = { auth, ownerAuth, optionalAuth };
