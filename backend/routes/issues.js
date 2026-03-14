const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Issue = require('../models/Issue');
const User = require('../models/User');
const { optionalAuth } = require('../middleware/auth');

// @route  GET /api/issues
// @desc   Get all issues - PUBLIC (no emails shown)
// @access Public
router.get('/', async (req, res) => {
  try {
    const issues = await Issue.find()
      .populate('user', 'username') // Only username, NOT email
      .sort({ createdAt: -1 })
      .lean();

    const formattedIssues = issues.map(issue => ({
      id: issue._id,
      userId: issue.user?._id || issue.user,
      userName: issue.user?.username || 'Anonymous',
      type: issue.type,
      location: issue.location,
      description: issue.description,
      image: issue.image,
      date: issue.createdAt,
      status: issue.status
      // NOTE: email intentionally NOT included for anonymity
    }));

    res.json(formattedIssues);
  } catch (error) {
    console.error('Get issues error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route  POST /api/issues
// @desc   Create a new issue (user must be logged in)
// @access Auth (user)
router.post('/', [
  optionalAuth,
  body('type').notEmpty().withMessage('Issue type is required'),
  body('location').notEmpty().withMessage('Location is required'),
  body('description').notEmpty().withMessage('Description is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const { type, location, description, image } = req.body;

    const issue = new Issue({
      user: req.userId || null,
      type,
      location,
      description,
      image: image || null
    });

    await issue.save();
    await issue.populate('user', 'username');

    // Emit socket event
    if (req.app.get('io')) {
      req.app.get('io').emit('new_issue', {
        id: issue._id,
        userName: issue.user?.username || 'Anonymous',
        type: issue.type,
        location: issue.location,
        description: issue.description,
        image: issue.image,
        date: issue.createdAt,
        status: issue.status
      });
    }

    res.status(201).json({ message: 'Issue reported successfully', id: issue._id });
  } catch (error) {
    console.error('Create issue error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route  POST /api/issues/:id/rate
// @desc   Rate a solved issue (user must be logged in)
// @access Auth (user)
router.post('/:id/rate', optionalAuth, async (req, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized. Please log in.' });

    const { rating } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Please provide a valid rating between 1 and 5' });
    }

    const issue = await Issue.findById(req.params.id);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });
    
    // Check if the issue belongs to this user
    if (issue.user.toString() !== req.userId && req.userId !== 'owner') {
      return res.status(403).json({ error: 'You can only rate your own issues' });
    }

    if (issue.status !== 'solved') {
      return res.status(400).json({ error: 'You can only rate solved issues' });
    }

    if (issue.rating) {
      return res.status(400).json({ error: 'You have already rated this issue' });
    }

    issue.rating = rating;
    await issue.save();

    res.json({ message: 'Rating submitted successfully', rating: issue.rating });
  } catch (error) {
    console.error('Rate issue error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
