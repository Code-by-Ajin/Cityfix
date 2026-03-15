const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Issue = require('../models/Issue');
const User = require('../models/User');
const { ownerAuth } = require('../middleware/auth');
const nodemailer = require('nodemailer');

function getTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.OWNER_EMAIL,
      pass: process.env.OWNER_EMAIL_PASS  // Must be a Gmail App Password, NOT your regular password
    }
  });
}

// @route  GET /api/owner/issues
// @desc   Get all issues WITH reporter email (owner only)
// @access Owner
router.get('/issues', ownerAuth, async (req, res) => {
  try {
    const issues = await Issue.find()
      .populate('user', 'username email') // email included for owner
      .sort({ createdAt: -1 })
      .lean();

    const formattedIssues = issues.map(issue => ({
      id: issue._id,
      reporter_name: issue.user?.username || 'Anonymous',
      reporter_email: issue.user?.email || 'No email (anonymous)',
      type: issue.type,
      location: issue.location,
      description: issue.description,
      image: issue.image,
      date: issue.createdAt,
      status: issue.status,
      rating: issue.rating,
      review: issue.review
    }));

    res.json(formattedIssues);
  } catch (error) {
    console.error('Owner get issues error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route  GET /api/owner/users
// @desc   Get all registered users with email (owner only)
// @access Owner
router.get('/users', ownerAuth, async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 }).lean();

    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const totalReports = await Issue.countDocuments({ user: user._id });
        const solvedReports = await Issue.countDocuments({ user: user._id, status: 'solved' });
        return {
          id: user._id,
          username: user.username,
          email: user.email,
          points: user.points,
          total_reports: totalReports,
          solved_reports: solvedReports,
          joined: user.createdAt
        };
      })
    );

    res.json(usersWithStats);
  } catch (error) {
    console.error('Owner get users error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route  PUT /api/owner/issues/:id/status
// @desc   Update issue status (owner only)
// @access Owner
router.put('/issues/:id/status', ownerAuth, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'in-progress', 'solved'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const issue = await Issue.findById(req.params.id);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });

    const oldStatus = issue.status;
    let pointsToAward = 0;

    // Award points when moving to solved
    if (issue.user && status === 'solved' && oldStatus !== 'solved') {
      pointsToAward = 20;
    } else if (issue.user && status === 'in-progress' && oldStatus === 'pending') {
      pointsToAward = 10;
    }

    issue.status = status;
    issue.pointsAwarded += pointsToAward;
    await issue.save();

    // Award points to user & get reporter info
    let reporterEmail = null;
    let reporterName = null;
    if (pointsToAward > 0 && issue.user) {
      const user = await User.findById(issue.user);
      if (user) {
        user.points += pointsToAward;
        await user.save();
        reporterEmail = user.email;
        reporterName = user.username;
      }
    } else if (status === 'solved' && oldStatus !== 'solved' && issue.user) {
      // Even if no extra points, still get reporter info for email
      const user = await User.findById(issue.user);
      if (user) {
        reporterEmail = user.email;
        reporterName = user.username;
      }
    }

    // ✉️  Send "SOLVED" notification email with direct star-rating links
    if (status === 'solved' && oldStatus !== 'solved' && reporterEmail) {
      if (!process.env.OWNER_EMAIL_PASS) {
        console.log('ℹ️  Skipping email: set OWNER_EMAIL_PASS (Gmail App Password) in backend/.env to enable notifications.');
      } else {
        // Generate a secure one-time token for email-based rating
        const ratingToken = crypto.randomBytes(32).toString('hex');
        issue.ratingToken = ratingToken;
        issue.ratingTokenUsed = false;
        await issue.save();

        const apiUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 5000}`;
        const appUrl = process.env.CLIENT_URL || 'http://localhost:3000';

        // Build clickable star buttons (1–5), each goes directly to the rating page
        const starLinks = [1, 2, 3, 4, 5].map(n => {
          const url = `${apiUrl}/api/issues/${issue._id}/email-rate?token=${ratingToken}&rating=${n}`;
          return `
            <a href="${url}" style="
              display:inline-block;
              font-size:32px;
              text-decoration:none;
              color:#d1d5db;
              margin:0 4px;
              transition:color 0.1s;
              line-height:1;
            " title="Rate ${n} star${n > 1 ? 's' : ''}">&#9733;</a>`;
        }).join('');

        const htmlEmail = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#f0f4f8;margin:0;padding:24px 16px;">
  <div style="max-width:560px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#2563eb,#06b6d4);padding:32px;text-align:center;">
      <div style="font-size:2rem;margin-bottom:6px;">✅</div>
      <h1 style="color:white;margin:0;font-size:22px;font-weight:700;">Issue Resolved!</h1>
      <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:13px;">CityFix Community Platform</p>
    </div>

    <!-- Body -->
    <div style="padding:32px;">
      <p style="font-size:15px;color:#374151;margin-bottom:4px;">Hello <strong>${reporterName}</strong>,</p>
      <p style="font-size:15px;color:#374151;margin-bottom:20px;">
        Great news! The issue you reported has been marked as
        <strong style="color:#22c55e;">Solved ✅</strong>.
      </p>

      <!-- Issue details -->
      <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:18px 20px;margin-bottom:24px;">
        <p style="margin:0 0 8px;font-size:12px;color:#0369a1;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;">Issue Details</p>
        <p style="margin:4px 0;font-size:14px;color:#1e3a5f;"><strong>Type:</strong> ${issue.type}</p>
        <p style="margin:4px 0;font-size:14px;color:#1e3a5f;"><strong>Location:</strong> ${issue.location}</p>
        <p style="margin:4px 0;font-size:14px;color:#1e3a5f;"><strong>Points Awarded:</strong> +${pointsToAward} 🎉</p>
      </div>

      <!-- Star Rating Section -->
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:22px 20px;margin-bottom:24px;text-align:center;">
        <p style="font-size:15px;color:#374151;font-weight:700;margin:0 0 6px;">⭐ Rate the Resolution</p>
        <p style="font-size:13px;color:#6b7280;margin:0 0 18px;">
          Click a star below to instantly submit your rating.<br>
          You can also add a written review on the next page.
        </p>

        <!-- Clickable star links -->
        <div style="margin:0 0 18px;">
          ${starLinks}
        </div>

        <p style="font-size:12px;color:#9ca3af;margin:0;">
          Each star opens a quick feedback page — no login required.
        </p>
      </div>

      <!-- CTA button -->
      <div style="text-align:center;margin-bottom:24px;">
        <a href="${apiUrl}/api/issues/${issue._id}/email-rate?token=${ratingToken}"
           style="display:inline-block;background:linear-gradient(135deg,#2563eb,#06b6d4);color:white;text-decoration:none;padding:13px 32px;border-radius:10px;font-size:15px;font-weight:600;">
          ⭐ Open Rating &amp; Review Page
        </a>
      </div>

      <!-- Footer -->
      <p style="font-size:13px;color:#9ca3af;text-align:center;border-top:1px solid #f3f4f6;padding-top:16px;margin:0;">
        Thank you for making your city better! 🏙️<br>
        <strong style="color:#2563eb;">The CityFix Team</strong>
      </p>
    </div>
  </div>
</body>
</html>`;

        try {
          const transporter = getTransporter();
          await transporter.sendMail({
            from: `"CityFix" <${process.env.OWNER_EMAIL}>`,
            to: reporterEmail,
            subject: `✅ CityFix: Your "${issue.type}" issue has been solved! Please rate us ⭐`,
            html: htmlEmail,
            text: `Hello ${reporterName}, your issue "${issue.type}" at "${issue.location}" has been solved! You earned +${pointsToAward} points. Please rate the resolution here: ${apiUrl}/api/issues/${issue._id}/email-rate?token=${ratingToken} — Thank you, The CityFix Team`
          });
          console.log(`✉️  Solved notification + rating email sent to ${reporterEmail}`);
        } catch (err) {
          console.error('❌ Failed to send solved email. Check Gmail App Password in .env:', err.message);
        }
      }
    }

    // Emit socket event
    if (req.app.get('io')) {
      req.app.get('io').emit('status_updated', {
        issue_id: issue._id,
        status: issue.status,
        points_awarded: pointsToAward
      });
    }

    res.json({ message: 'Status updated successfully', status: issue.status, points_awarded: pointsToAward });
  } catch (error) {
    console.error('Owner update status error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route  DELETE /api/owner/issues/:id
// @desc   Delete an issue (owner only)
// @access Owner
router.delete('/issues/:id', ownerAuth, async (req, res) => {
  try {
    const issue = await Issue.findByIdAndDelete(req.params.id);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });

    if (req.app.get('io')) {
      req.app.get('io').emit('issue_deleted', { issue_id: req.params.id });
    }

    res.json({ message: 'Issue deleted successfully' });
  } catch (error) {
    console.error('Owner delete issue error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
