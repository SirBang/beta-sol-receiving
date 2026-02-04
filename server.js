const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const fetch = require('node-fetch');
const session = require('express-session');

const Invoice = require('./models/Invoice');
const Admin = require('./models/Admin');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/beta_tester';
const API_URL = process.env.API_URL || 'https://httpbin.org/post';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me-in-production';

mongoose.connect(MONGODB_URI).catch((err) => {
  console.error('MongoDB connection error:', err.message);
});

app.use(express.json());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 },
}));

const requireAdmin = (req, res, next) => {
  if (req.session?.adminId) return next();
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  return res.redirect('/admin/login');
};

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
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

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`MongoDB: ${MONGODB_URI}`);
  console.log(`Forwarding to: ${API_URL}`);
});
