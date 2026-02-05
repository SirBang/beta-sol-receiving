const mongoose = require('mongoose');

const fundRequestSchema = new mongoose.Schema({
  fundRequestNumber: {
    type: String,
    required: true,
    trim: true,
  },
  fullName: {
    type: String,
    required: true,
    trim: true,
  },
  platform: {
    type: String,
    required: true,
    trim: true,
  },
  xProfile: {
    type: String,
    trim: true,
    default: '',
  },
  discord: {
    type: String,
    trim: true,
    default: '',
  },
  telegram: {
    type: String,
    trim: true,
    default: '',
  },
  solAmount: {
    type: Number,
    default: 0.5,
    required: true,
  },
  usdPrice: {
    type: Number,
    default: 0,
  },
  confirmedByAdmin: {
    type: Boolean,
    default: false,
  },
  confirmedBy: {
    type: String,
    default: null,
  },
  visited: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('FundRequest', fundRequestSchema);
