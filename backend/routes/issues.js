const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Issue = require('../models/Issue');
const User = require('../models/User');
const { optionalAuth } = require('../middleware/auth');
const nodemailer = require('nodemailer');

// Shared transporter for review-forward email
function getTransporter() {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.OWNER_EMAIL,
      pass: process.env.OWNER_EMAIL_PASS
    }
  });
}

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
      status: issue.status,
      rating: issue.rating,
      review: issue.review
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
// @desc   Rate a solved issue (user must be logged in, from app UI)
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

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL-BASED RATING & REVIEW
// GET  /api/issues/:id/email-rate?token=X&rating=Y  → render rating+review page
// POST /api/issues/:id/email-rate                   → save rating+review, forward review to owner
// ─────────────────────────────────────────────────────────────────────────────

// @route  GET /api/issues/:id/email-rate
// @desc   Serve a beautiful HTML rating+review form from the email link
// @access Public (protected by one-time token)
router.get('/:id/email-rate', async (req, res) => {
  try {
    const { token, rating: preselectedRating } = req.query;
    const issue = await Issue.findById(req.params.id).populate('user', 'username');

    if (!issue) return res.status(404).send(`<h2 style="font-family:sans-serif;text-align:center;margin-top:60px">Issue not found.</h2>`);
    if (!token || issue.ratingToken !== token) {
      return res.send(htmlPage('❌ Invalid Link', '<p style="text-align:center;color:#ef4444;font-size:1.1rem">This rating link is invalid or has expired.</p>'));
    }
    if (issue.ratingTokenUsed) {
      const stars = Array.from({ length: 5 }).map((_, i) =>
        `<span style="font-size:2rem;color:${i < issue.rating ? '#f59e0b' : '#d1d5db'}">★</span>`
      ).join('');
      return res.send(htmlPage('✅ Already Rated', `
        <div style="text-align:center">
          <p style="font-size:1.05rem;color:#555;">You have already submitted your rating for this issue.</p>
          <div style="margin:16px 0">${stars}</div>
          ${issue.review ? `<p style="color:#4b5563;font-style:italic;">"${issue.review}"</p>` : ''}
          <p style="color:#9ca3af;font-size:0.9rem">Thank you for your feedback! 🙏</p>
        </div>
      `));
    }

    const r = parseInt(preselectedRating) || 0;
    const issueType = issue.type;
    const issueLocation = issue.location;
    const reporterName = issue.user?.username || 'Reporter';
    const issueId = issue._id;

    const starRow = [1, 2, 3, 4, 5].map(n => `
      <label class="star-label" title="${n} star${n > 1 ? 's' : ''}">
        <input type="radio" name="rating" value="${n}" ${n === r ? 'checked' : ''} required>
        <span class="star ${n <= r ? 'filled' : ''}">★</span>
      </label>
    `).join('');

    const html = htmlPage('⭐ Rate Your Issue Resolution', `
      <p style="text-align:center;color:#555;margin-bottom:6px">Hello, <strong>${reporterName}</strong>!</p>
      <p style="text-align:center;color:#555;font-size:0.95rem;margin-bottom:20px">
        Your report — <strong>${issueType}</strong> at <em>${issueLocation}</em> — has been resolved.<br>
        Please take a moment to rate the resolution and share your feedback.
      </p>
      <form method="POST" action="/api/issues/${issueId}/email-rate?token=${token}">
        <div class="stars-row">${starRow}</div>

        <div class="form-group">
          <label for="review">📝 Your Review <span style="color:#9ca3af;font-weight:400">(optional)</span></label>
          <textarea id="review" name="review" rows="4"
            placeholder="Tell us how the issue was resolved, what could be improved..."
            maxlength="1000"></textarea>
        </div>

        <button type="submit" class="submit-btn">
          🌟 Submit My Rating &amp; Review
        </button>
      </form>
    `, true);

    res.send(html);
  } catch (error) {
    console.error('Email rate GET error:', error);
    res.status(500).send(`<h2 style="font-family:sans-serif;text-align:center;margin-top:60px">Server error. Please try again later.</h2>`);
  }
});

// @route  POST /api/issues/:id/email-rate
// @desc   Save rating + review, send review to owner email
// @access Public (protected by one-time token)
router.post('/:id/email-rate', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const { token } = req.query;
    const { rating, review } = req.body;

    const issue = await Issue.findById(req.params.id).populate('user', 'username email');
    if (!issue) return res.status(404).send(htmlPage('Not Found', '<p style="text-align:center;color:#ef4444">Issue not found.</p>'));
    if (!token || issue.ratingToken !== token) {
      return res.send(htmlPage('❌ Invalid Link', '<p style="text-align:center;color:#ef4444;font-size:1.1rem">This rating link is invalid or has expired.</p>'));
    }
    if (issue.ratingTokenUsed) {
      return res.send(htmlPage('✅ Already Rated', '<p style="text-align:center;color:#555">You have already submitted your feedback. Thank you!</p>'));
    }

    const ratingNum = parseInt(rating);
    if (!ratingNum || ratingNum < 1 || ratingNum > 5) {
      return res.send(htmlPage('⚠️ Invalid Rating', '<p style="text-align:center;color:#f59e0b">Please select a star rating (1–5) before submitting.</p>'));
    }

    // Save rating + review
    issue.rating = ratingNum;
    issue.review = review ? review.trim().substring(0, 1000) : null;
    issue.ratingTokenUsed = true;
    await issue.save();

    const stars = Array.from({ length: 5 }).map((_, i) =>
      `<span style="font-size:2rem;color:${i < ratingNum ? '#f59e0b' : '#d1d5db'}">★</span>`
    ).join('');
    const reporterName = issue.user?.username || 'Reporter';

    // 📧 Forward review to owner email
    if (process.env.OWNER_EMAIL_PASS && process.env.OWNER_EMAIL) {
      try {
        const transporter = getTransporter();
        const reviewHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:20px;">
  <div style="max-width:560px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.1);">
    <div style="background:linear-gradient(135deg,#2563eb,#06b6d4);padding:24px 32px;text-align:center;">
      <h1 style="color:white;margin:0;font-size:20px;">⭐ New Rating & Review</h1>
      <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:13px;">CityFix — Resolution Feedback</p>
    </div>
    <div style="padding:24px 32px;">
      <p style="font-size:15px;color:#333;">A reporter has rated the resolution of their issue.</p>
      <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:16px 20px;margin:16px 0;">
        <p style="margin:4px 0;font-size:14px;color:#1e3a5f;"><strong>Reporter:</strong> ${reporterName} (${issue.user?.email || 'Anonymous'})</p>
        <p style="margin:4px 0;font-size:14px;color:#1e3a5f;"><strong>Issue Type:</strong> ${issue.type}</p>
        <p style="margin:4px 0;font-size:14px;color:#1e3a5f;"><strong>Location:</strong> ${issue.location}</p>
      </div>
      <div style="text-align:center;margin:16px 0;">
        <p style="font-size:13px;color:#555;margin-bottom:6px;font-weight:600;">Rating Given:</p>
        <div style="font-size:2rem;letter-spacing:4px;">
          ${Array.from({ length: 5 }).map((_, i) => i < ratingNum ? '⭐' : '☆').join('')}
        </div>
        <p style="font-size:1rem;color:#374151;font-weight:600;margin-top:4px;">${ratingNum} / 5 Stars</p>
      </div>
      ${issue.review ? `
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px 20px;margin:16px 0;">
        <p style="margin:0 0 6px;font-size:13px;color:#92400e;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Reporter's Review</p>
        <p style="margin:0;font-size:14px;color:#374151;font-style:italic;">"${issue.review}"</p>
      </div>` : '<p style="color:#9ca3af;text-align:center;font-size:13px;margin:12px 0;">No written review was provided.</p>'}
      <p style="font-size:13px;color:#999;text-align:center;margin-top:20px;border-top:1px solid #eee;padding-top:14px;">
        CityFix Platform · Issue ID: ${issue._id}
      </p>
    </div>
  </div>
</body>
</html>`;

        await transporter.sendMail({
          from: `"CityFix Ratings" <${process.env.OWNER_EMAIL}>`,
          to: process.env.OWNER_EMAIL,
          subject: `⭐ Rating ${ratingNum}/5 — "${issue.type}" at ${issue.location}`,
          html: reviewHtml,
          text: `New Rating for "${issue.type}" at "${issue.location}":\nReporter: ${reporterName}\nRating: ${ratingNum}/5\nReview: ${issue.review || 'None provided'}`
        });
        console.log(`✉️  Review forwarded to owner: ${process.env.OWNER_EMAIL}`);
      } catch (emailErr) {
        console.error('Failed to forward review to owner:', emailErr.message);
      }
    }

    // Success page
    res.send(htmlPage('🎉 Thank You!', `
      <div style="text-align:center;">
        <div style="font-size:3rem;margin-bottom:8px;">🎉</div>
        <h2 style="color:#22c55e;margin:0 0 12px;">Thank you, ${reporterName}!</h2>
        <p style="color:#555;font-size:1rem;margin-bottom:16px;">Your rating and review have been submitted successfully.</p>
        <div style="margin:16px 0;">${stars}</div>
        ${issue.review ? `<p style="color:#4b5563;font-style:italic;max-width:320px;margin:0 auto;">"${issue.review}"</p>` : ''}
        <p style="color:#9ca3af;font-size:0.9rem;margin-top:20px;">Your feedback helps improve city services. 🏙️</p>
        <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}" style="display:inline-block;margin-top:20px;background:linear-gradient(135deg,#2563eb,#06b6d4);color:white;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600;">
          🌐 Back to CityFix
        </a>
      </div>
    `));
  } catch (error) {
    console.error('Email rate POST error:', error);
    res.status(500).send(htmlPage('Error', '<p style="text-align:center;color:#ef4444">Something went wrong. Please try again.</p>'));
  }
});

// ── Helper: wrap content in a full HTML page ──────────────────────────────────
function htmlPage(title, body, withStarStyles = false) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} — CityFix</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;background:#f0f4f8;min-height:100vh;display:flex;align-items:flex-start;justify-content:center;padding:40px 16px}
    .card{background:white;border-radius:16px;padding:40px 36px;max-width:520px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.10)}
    .logo{text-align:center;margin-bottom:24px}
    .logo span{font-size:1.5rem;font-weight:800;color:#2563eb}
    .logo span b{color:#06b6d4}
    h1{font-size:1.35rem;font-weight:700;text-align:center;margin-bottom:20px;color:#1e3a5f}
    .form-group{margin-bottom:18px}
    label{display:block;font-size:0.92rem;font-weight:600;color:#374151;margin-bottom:6px}
    textarea{width:100%;border:1.5px solid #d1d5db;border-radius:10px;padding:12px 14px;font-size:0.95rem;font-family:inherit;resize:vertical;transition:border-color .2s}
    textarea:focus{outline:none;border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,0.10)}
    .submit-btn{width:100%;padding:14px;background:linear-gradient(135deg,#2563eb,#06b6d4);color:white;border:none;border-radius:10px;font-size:1rem;font-weight:600;cursor:pointer;margin-top:8px;transition:opacity .2s}
    .submit-btn:hover{opacity:.88}
    ${withStarStyles ? `
    .stars-row{display:flex;justify-content:center;gap:12px;padding:16px 0 24px;direction:ltr}
    .star-label{cursor:pointer;font-size:0;display:inline-block}
    .star-label input{display:none}
    .star{font-size:2.6rem;color:#d1d5db;transition:color .15s,transform .15s;display:inline-block}
    .star.filled,.star-label:hover .star,.star-label input:checked ~ .star{color:#f59e0b}
    .stars-row:hover .star-label .star{color:#d1d5db}
    .stars-row .star-label:hover ~ .star-label .star{color:#d1d5db}
    .stars-row .star-label:hover .star,.stars-row .star-label:has(~ .star-label:hover) .star,.stars-row .star-label input:checked ~ .star{color:#f59e0b}
    /* JS-based approach for star interaction */
    ` : ''}
  </style>
  ${withStarStyles ? `
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      const labels = document.querySelectorAll('.star-label');
      const stars = document.querySelectorAll('.star');
      labels.forEach(function(lbl, idx) {
        lbl.addEventListener('mouseenter', function() {
          stars.forEach(function(s, si) { s.style.color = si <= idx ? '#f59e0b' : '#d1d5db'; });
        });
        lbl.addEventListener('mouseleave', function() {
          const checked = document.querySelector('input[name="rating"]:checked');
          const val = checked ? parseInt(checked.value) - 1 : -1;
          stars.forEach(function(s, si) { s.style.color = si <= val ? '#f59e0b' : '#d1d5db'; });
        });
        lbl.querySelector('input').addEventListener('change', function() {
          stars.forEach(function(s, si) { s.style.color = si <= idx ? '#f59e0b' : '#d1d5db'; });
        });
      });
    });
  </script>` : ''}
</head>
<body>
  <div class="card">
    <div class="logo">
      <span>City<b>Fix</b></span>
      <p style="color:#6b7280;font-size:0.85rem;margin-top:4px">Community Issue Platform</p>
    </div>
    <h1>${title}</h1>
    ${body}
  </div>
</body>
</html>`;
}

module.exports = router;
