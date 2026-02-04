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
  xProfile: {
    type: String,
    required: true,
    trim: true,
  },
  discord: {
    type: String,
    required: true,
    trim: true,
  },
  telegram: {
    type: String,
    required: true,
    trim: true,
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
}, {
  timestamps: true,
});

module.exports = mongoose.model('FundRequest', fundRequestSchema);
