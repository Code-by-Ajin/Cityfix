const mongoose = require('mongoose');

const issueSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  type: {
    type: String,
    required: [true, 'Issue type is required'],
    enum: ['Road Damage', 'Street Light', 'Garbage', 'Water Leak', 'Drainage', 'Fallen Tree', 'Illegal Dumping', 'Other']
  },
  location: {
    type: String,
    required: [true, 'Location is required']
  },
  description: {
    type: String,
    required: [true, 'Description is required']
  },
  image: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ['pending', 'in-progress', 'solved'],
    default: 'pending'
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    default: null
  },
  review: {
    type: String,
    default: null
  },
  ratingToken: {
    type: String,
    default: null
  },
  ratingTokenUsed: {
    type: Boolean,
    default: false
  },
  pointsAwarded: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Issue', issueSchema);
