const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const fetch = require('node-fetch');
const session = require('express-session');

const Invoice = require('./models/Invoice');
const Admin = require('./models/Admin');
const FundRequest = require('./models/FundRequest');
const Settings = require('./models/Settings');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/beta_tester';
const API_URL = process.env.API_URL || 'https://httpbin.org/post';
const PAYMENT_URL = process.env.PAYMENT_URL || 'http://localhost:51634/';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me-in-production';
const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY || '6LfRiWAsAAAAAITZbnsc7GPI5hJdXOg2E4NBavvI';

mongoose.connect(MONGODB_URI).catch((err) => {
  console.error('MongoDB connection error:', err.message);
});

app.use(express.json());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
  },
}));

const requireAdmin = (req, res, next) => {
  if (req.session?.adminId) return next();
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  return res.redirect('/admin/login');
};

// Helper function to get setting from DB or use default
async function getSetting(key, defaultValue) {
  try {
    let setting = await Settings.findOne({ key });
    if (!setting) {
      setting = new Settings({ key, value: defaultValue });
      await setting.save();
    }
    return setting.value;
  } catch (err) {
    console.error(`Error fetching setting ${key}:`, err.message);
    return defaultValue;
  }
}

// Helper function to set setting in DB
async function setSetting(key, value) {
  try {
    const setting = await Settings.findOneAndUpdate(
      { key },
      { value },
      { upsert: true, new: true }
    );
    return setting;
  } catch (err) {
    console.error(`Error setting ${key}:`, err.message);
    throw err;
  }
}

// Helper function to verify reCAPTCHA v3
async function verifyCaptcha(token) {
  if (!RECAPTCHA_SECRET_KEY) {
    console.warn('RECAPTCHA_SECRET_KEY not set, skipping verification');
    return true; // Skip verification if secret key is not set
  }

  try {
    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${RECAPTCHA_SECRET_KEY}&response=${token}`
    });
    const data = await response.json();

    // v3 returns a score between 0.0 and 1.0
    // 1.0 is very likely a good interaction, 0.0 is very likely a bot
    // Typical threshold is 0.5
    if (data.success && data.score !== undefined) {
      console.log(`reCAPTCHA score: ${data.score}`);
      return data.score >= 0.5;
    }

    return data.success === true;
  } catch (err) {
    console.error('reCAPTCHA verification error:', err.message);
    return false;
  }
}

app.get('/api/config', async (req, res) => {
  try {
    const paymentUrl = await getSetting('PAYMENT_URL', PAYMENT_URL);
    res.json({ paymentUrl });
  } catch (err) {
    res.json({ paymentUrl: PAYMENT_URL });
  }
});

// Get current Solana price from CoinGecko
app.get('/api/solana-price', async (req, res) => {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    const data = await response.json();

    if (data && data.solana && data.solana.usd) {
      res.json({
        success: true,
        price: data.solana.usd,
        timestamp: Date.now()
      });
    } else {
      throw new Error('Invalid response from CoinGecko');
    }
  } catch (err) {
    console.error('Solana price fetch error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch Solana price',
      fallbackPrice: 100 // Fallback price in case of error
    });
  }
});

app.get('/', (req, res) => {
  res.redirect("/fund-request");
});

app.get('/fund-request', (req, res) => {
  res.sendFile(path.join(__dirname, 'fundRequest.html'));
});

app.get('/admin/login', (req, res) => {
  if (req.session?.adminId) return res.redirect('/admin');
  res.sendFile(path.join(__dirname, 'admin-login.html'));
});

app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.post('/api/admin/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }
    const existing = await Admin.findOne({ username: username.trim() });
    if (existing) {
      return res.status(400).json({ success: false, error: 'Username already taken' });
    }
    const admin = new Admin({ username: username.trim(), password });
    await admin.save();
    req.session.adminId = admin._id.toString();
    req.session.adminUsername = admin.username;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password required' });
    }
    const admin = await Admin.findOne({ username: username.trim() });
    if (!admin || !(await admin.comparePassword(password))) {
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }
    req.session.adminId = admin._id.toString();
    req.session.adminUsername = admin.username;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
});

app.use(express.static(path.join(__dirname)));

app.get('/api/admin/invoices', requireAdmin, async (req, res) => {
  try {
    const invoices = await Invoice.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: invoices });
  } catch (err) {
    console.error('List invoices error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/payment', (req, res) => {
  res.sendFile(path.join(__dirname, 'payment.html'));
});

app.get('/fund-request-payment', (req, res) => {
  res.sendFile(path.join(__dirname, 'fundRequestPayment.html'));
});

app.get('/api/invoice/by-number/:invoiceNumber', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
}, async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ invoiceNumber: req.params.invoiceNumber }).lean();
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    res.json({ success: true, data: invoice });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/invoice/:id', async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id).lean();
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    res.json({ success: true, data: invoice });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/admin/invoices/:id/confirm', requireAdmin, async (req, res) => {
  try {
    const invoice = await Invoice.findByIdAndUpdate(
      req.params.id,
      { confirmedByAdmin: true },
      { new: true }
    ).lean();
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    res.json({ success: true, data: invoice });
  } catch (err) {
    console.error('Confirm invoice error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/invoice', async (req, res) => {
  try {
    const { nickname, fullName, bugsCount, gameplayTime, amount } = req.body;

    const invoiceNumber = String(Math.floor(Math.random() * 90000000) + 10000000);

    const invoice = new Invoice({
      invoiceNumber,
      nickname,
      fullName,
      bugsCount: Number(bugsCount),
      gameplayTime: Number(gameplayTime),
      amount: Number(amount),
    });

    await invoice.save();

    const payload = invoice.toObject();
    delete payload.__v;

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    const statusOk = response.ok;

    res.status(statusOk ? 200 : response.status).json({
      success: true,
      data: payload,
      apiResponse: data,
    });
  } catch (err) {
    console.error('Invoice API error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// Fund Request endpoints
app.post('/api/fund-request', async (req, res) => {
  try {
    const { fullName, platform, xProfile, discord, telegram, captcha } = req.body;

    // Verify reCAPTCHA
    const captchaValid = await verifyCaptcha(captcha);
    if (!captchaValid) {
      return res.status(400).json({ success: false, error: 'reCAPTCHA verification failed. Please try again.' });
    }

    if (!fullName || !platform) {
      return res.status(400).json({ success: false, error: 'Full name and platform are required' });
    }

    // Validate at least one social is provided
    const xTrim = (xProfile || '').trim();
    const discordTrim = (discord || '').trim();
    const telegramTrim = (telegram || '').trim();

    if (!xTrim && !discordTrim && !telegramTrim) {
      return res.status(400).json({ success: false, error: 'At least one social media contact is required' });
    }

    const fundRequestNumber = String(Math.floor(Math.random() * 90000000) + 10000000);

    // Fetch current SOL price from CoinGecko
    const solAmount = 0.5;
    let usdPrice = solAmount * 100; // Fallback price

    try {
      const priceResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      const priceData = await priceResponse.json();
      if (priceData && priceData.solana && priceData.solana.usd) {
        usdPrice = solAmount * priceData.solana.usd;
      }
    } catch (priceErr) {
      console.error('Failed to fetch SOL price for fund request:', priceErr.message);
      // Continue with fallback price
    }

    const fundRequest = new FundRequest({
      fundRequestNumber,
      fullName,
      platform,
      xProfile: xTrim,
      discord: discordTrim,
      telegram: telegramTrim,
      solAmount,
      usdPrice,
    });

    await fundRequest.save();

    const payload = fundRequest.toObject();
    delete payload.__v;

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    const statusOk = response.ok;

    res.status(statusOk ? 200 : response.status).json({
      success: true,
      data: payload,
      apiResponse: data,
    });
  } catch (err) {
    console.error('Fund request API error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

app.get('/api/fund-request/:id', async (req, res) => {
  try {
    const fundRequest = await FundRequest.findById(req.params.id).lean();
    if (!fundRequest) {
      return res.status(404).json({ success: false, error: 'Fund request not found' });
    }
    res.json({ success: true, data: fundRequest });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/fund-request/by-number/:fundRequestNumber', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
}, async (req, res) => {
  try {
    const fundRequest = await FundRequest.findOne({ fundRequestNumber: req.params.fundRequestNumber }).lean();
    if (!fundRequest) {
      return res.status(404).json({ success: false, error: 'Fund request not found' });
    }
    res.json({ success: true, data: fundRequest });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/fund-requests', requireAdmin, async (req, res) => {
  try {
    const fundRequests = await FundRequest.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: fundRequests });
  } catch (err) {
    console.error('List fund requests error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/admin/fund-requests/:id/confirm', requireAdmin, async (req, res) => {
  try {
    const fundRequest = await FundRequest.findByIdAndUpdate(
      req.params.id,
      { confirmedByAdmin: true, confirmedBy: req.session.adminUsername },
      { new: true }
    ).lean();
    if (!fundRequest) {
      return res.status(404).json({ success: false, error: 'Fund request not found' });
    }
    res.json({ success: true, data: fundRequest });
  } catch (err) {
    console.error('Confirm fund request error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/fund-request/:id/visit', async (req, res) => {
  try {
    const fundRequest = await FundRequest.findByIdAndUpdate(
      req.params.id,
      { visited: true },
      { new: true }
    ).lean();
    if (!fundRequest) {
      return res.status(404).json({ success: false, error: 'Fund request not found' });
    }
    res.json({ success: true, data: fundRequest });
  } catch (err) {
    console.error('Mark fund request as visited error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Settings endpoints
app.get('/api/admin/settings', requireAdmin, async (req, res) => {
  try {
    const paymentUrl = await getSetting('PAYMENT_URL', PAYMENT_URL);
    res.json({ success: true, settings: { paymentUrl } });
  } catch (err) {
    console.error('Get settings error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/admin/settings', requireAdmin, async (req, res) => {
  try {
    const { paymentUrl } = req.body;
    if (!paymentUrl) {
      return res.status(400).json({ success: false, error: 'Payment URL is required' });
    }
    await setSetting('PAYMENT_URL', paymentUrl);
    res.json({ success: true, settings: { paymentUrl } });
  } catch (err) {
    console.error('Update settings error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`MongoDB: ${MONGODB_URI}`);
  console.log(`Forwarding to: ${API_URL}`);
});
