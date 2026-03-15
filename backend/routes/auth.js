const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');

// @route  POST /api/auth/register
// @desc   Register new user - stored in MongoDB
// @access Public
router.post('/register', [
  body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  body('email').isEmail().withMessage('Please enter a valid email').custom(value => {
    if (!value.toLowerCase().endsWith('@gmail.com')) {
      throw new Error('Only @gmail.com addresses are accepted');
    }
    return true;
  }),
  body('password').isLength({ min: 4 }).withMessage('Password must be at least 4 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const { username, email, password } = req.body;

    // Prevent owner email from registering as user
    if (email.toLowerCase() === process.env.OWNER_EMAIL.toLowerCase()) {
      return res.status(400).json({ error: 'This email is reserved' });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ error: existingUser.email === email ? 'Email already registered' : 'Username already taken' });
    }

    const user = new User({ username, email, password });
    await user.save();

    const token = jwt.sign({ id: user._id, role: 'user' }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      message: 'Registration successful',
      token,
      user: { id: user._id, username: user.username, email: user.email, points: user.points, role: 'user' }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route  POST /api/auth/login
// @desc   Login user or owner
// @access Public
router.post('/login', [
  body('email').isEmail().withMessage('Please enter a valid email'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const { email, password } = req.body;

    // Check if owner
    if (email.toLowerCase() === process.env.OWNER_EMAIL.toLowerCase()) {
      if (password !== process.env.OWNER_PASSWORD) {
        return res.status(401).json({ error: 'Invalid owner credentials' });
      }
      const token = jwt.sign({ email: process.env.OWNER_EMAIL, role: 'owner' }, process.env.JWT_SECRET, { expiresIn: '1d' });
      return res.json({
        message: 'Owner login successful',
        token,
        user: { email: process.env.OWNER_EMAIL, username: 'Owner', role: 'owner' }
      });
    }

    // Regular user login
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign({ id: user._id, role: 'user' }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      message: 'Login successful',
      token,
      user: { id: user._id, username: user.username, email: user.email, points: user.points, role: 'user' }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

const nodemailer = require('nodemailer');

function getTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.OWNER_EMAIL,
      pass: process.env.OWNER_EMAIL_PASS
    }
  });
}

// @route  POST /api/auth/rewards/claim
// @desc   Claim a reward by deducting points
// @access Auth (user)
router.post('/rewards/claim', async (req, res) => {
  try {
    const authHeader = req.header('Authorization');
    if (!authHeader) return res.status(401).json({ error: 'No token, authorization denied' });
    
    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.role === 'owner') return res.status(403).json({ error: 'Owners cannot claim rewards' });

    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { cost, title } = req.body; // Added title to request
    if (user.points < cost) {
      return res.status(400).json({ error: 'Not enough points' });
    }

    user.points -= cost;
    await user.save();

    // Send reward email
    if (user.email && process.env.OWNER_EMAIL_PASS) {
      const htmlEmail = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background:#f4f4f4; margin:0; padding:20px;">
  <div style="max-width:560px; margin:0 auto; background:white; border-radius:12px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,0.1);">
    <div style="background:linear-gradient(135deg,#2563eb,#06b6d4); padding:28px 32px; text-align:center;">
      <h1 style="color:white; margin:0; font-size:22px;">🎉 Reward Claimed!</h1>
      <p style="color:rgba(255,255,255,0.85); margin:8px 0 0; font-size:14px;">CityFix Community Platform</p>
    </div>
    <div style="padding:28px 32px;">
      <p style="font-size:15px; color:#333;">Hello <strong>${user.username}</strong>,</p>
      <p style="font-size:15px; color:#333;">Congratulations! You have successfully redeemed your points for a reward.</p>

      <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:10px; padding:16px 20px; margin:20px 0;">
        <p style="margin:0 0 6px; font-size:13px; color:#0369a1; font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">Reward Details</p>
        <p style="margin:4px 0; font-size:16px; color:#1e3a5f;"><strong>Item:</strong> ${title || 'Special CityFix Reward'}</p>
        <p style="margin:4px 0; font-size:14px; color:#1e3a5f;"><strong>Points Spent:</strong> ${cost} 🪙</p>
        <p style="margin:4px 0; font-size:14px; color:#1e3a5f;"><strong>Remaining Balance:</strong> ${user.points} 🪙</p>
      </div>

      <p style="font-size:14px; color:#555;">To redeem this in person, simply show this email at participating partner locations.</p>

      <p style="font-size:13px; color:#999; text-align:center; margin-top:24px; border-top:1px solid #eee; padding-top:16px;">
        Thank you for making your city better! 🏙️<br>
        <strong style="color:#2563eb;">The CityFix Team</strong>
      </p>
    </div>
  </div>
</body>
</html>`;
      try {
        await getTransporter().sendMail({
          from: `"CityFix Rewards" <${process.env.OWNER_EMAIL}>`,
          to: user.email,
          subject: `🎉 CityFix: Your reward "${title || 'Special Reward'}" is ready!`,
          html: htmlEmail,
        });
        console.log(`✉️  Reward email sent to ${user.email}`);
      } catch (err) {
        console.error('Failed to send reward email (Did you use a Gmail App Password?):', err.message);
      }
    } else {
       console.log('ℹ️  Skipping reward email. OWNER_EMAIL_PASS not set in .env');
    }

    res.json({ message: 'Reward claimed successfully', newPoints: user.points });
  } catch (error) {
    console.error('Claim reward error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
