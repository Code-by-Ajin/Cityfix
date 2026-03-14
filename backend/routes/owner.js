const express = require('express');
const router = express.Router();
const Issue = require('../models/Issue');
const User = require('../models/User');
const { ownerAuth } = require('../middleware/auth');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.OWNER_EMAIL,
    pass: process.env.OWNER_EMAIL_PASS // User needs to set this App Password in .env
  }
});

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
      status: issue.status
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

    // Award points to user
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
    }

    // Send email if solved — with rating link
    if (status === 'solved' && oldStatus !== 'solved' && reporterEmail && process.env.OWNER_EMAIL_PASS) {
      const appUrl = process.env.CLIENT_URL || 'http://localhost:3000';
      const htmlEmail = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background:#f4f4f4; margin:0; padding:20px;">
  <div style="max-width:560px; margin:0 auto; background:white; border-radius:12px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,0.1);">
    <div style="background:linear-gradient(135deg,#2563eb,#06b6d4); padding:28px 32px; text-align:center;">
      <h1 style="color:white; margin:0; font-size:22px;">✅ Issue Resolved!</h1>
      <p style="color:rgba(255,255,255,0.85); margin:8px 0 0; font-size:14px;">CityFix Community Platform</p>
    </div>
    <div style="padding:28px 32px;">
      <p style="font-size:15px; color:#333;">Hello <strong>${reporterName}</strong>,</p>
      <p style="font-size:15px; color:#333;">Great news! The issue you reported has been marked as <strong style="color:#22c55e;">Solved</strong>.</p>

      <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:10px; padding:16px 20px; margin:20px 0;">
        <p style="margin:0 0 6px; font-size:13px; color:#0369a1; font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">Issue Details</p>
        <p style="margin:4px 0; font-size:14px; color:#1e3a5f;"><strong>Type:</strong> ${issue.type}</p>
        <p style="margin:4px 0; font-size:14px; color:#1e3a5f;"><strong>Location:</strong> ${issue.location}</p>
        <p style="margin:4px 0; font-size:14px; color:#1e3a5f;"><strong>Points Awarded:</strong> +${pointsToAward} 🎉</p>
      </div>

      <p style="font-size:15px; color:#333; font-weight:600; margin-bottom:12px;">⭐ How would you rate the resolution?</p>
      <p style="font-size:13px; color:#666; margin-bottom:16px;">Your feedback helps improve our city services. Please log in to the app and rate this resolution:</p>

      <div style="text-align:center; margin:16px 0; font-size:32px; letter-spacing:8px;">
        ⭐⭐⭐⭐⭐
      </div>

      <div style="text-align:center; margin:24px 0;">
        <a href="${appUrl}" style="
          display:inline-block; background:linear-gradient(135deg,#2563eb,#06b6d4);
          color:white; text-decoration:none; padding:12px 28px; border-radius:8px;
          font-size:15px; font-weight:600; letter-spacing:0.3px;">
          🌐 Open CityFix App to Rate
        </a>
      </div>

      <p style="font-size:13px; color:#999; text-align:center; margin-top:24px; border-top:1px solid #eee; padding-top:16px;">
        Thank you for making your city better! 🏙️<br>
        <strong style="color:#2563eb;">The CityFix Team</strong>
      </p>
    </div>
  </div>
</body>
</html>`;
      try {
        await transporter.sendMail({
          from: `"CityFix" <${process.env.OWNER_EMAIL}>`,
          to: reporterEmail,
          subject: `✅ CityFix: Your "${issue.type}" report has been solved!`,
          html: htmlEmail,
          text: `Hello ${reporterName}, Your issue "${issue.type}" at "${issue.location}" has been solved! You earned ${pointsToAward} points. Please open the CityFix app (${appUrl}) to rate the resolution. Thank you! - The CityFix Team`
        });
        console.log(`✉️  Solved notification email sent to ${reporterEmail}`);
      } catch (err) {
        console.error('Failed to send email (Did you use a Gmail App Password?):', err.message);
      }
    } else if (status === 'solved' && !process.env.OWNER_EMAIL_PASS) {
      console.log('ℹ️  Skipping email: set OWNER_EMAIL_PASS (App Password) in backend/.env to enable notifications.');
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
