const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const fetch = require('node-fetch');

const Invoice = require('./models/Invoice');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/beta_tester';
const API_URL = process.env.API_URL || 'https://httpbin.org/post';

mongoose.connect(MONGODB_URI).catch((err) => {
  console.error('MongoDB connection error:', err.message);
});

app.use(express.json());

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.use(express.static(path.join(__dirname)));

app.get('/api/admin/invoices', async (req, res) => {
  try {
    const invoices = await Invoice.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: invoices });
  } catch (err) {
    console.error('List invoices error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/admin/invoices/:id/confirm', async (req, res) => {
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

    const invoice = new Invoice({
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
