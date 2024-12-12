const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const cors = require('cors');
const admin = require('firebase-admin');

dotenv.config();

const app = express();
const port = 3200;

// Middleware
app.use(bodyParser.json());
app.use(cors());
app.use(express.static('public'));

// Firebase Admin Initialization
const serviceAccount = require('./serviceAccountKey.json'); // Ganti dengan path file Firebase key
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://ta-es-ie-s-default-rtdb.asia-southeast1.firebasedatabase.app/',
});

const db = admin.database();

// Cache untuk menyimpan data sementara
let cache = {
  tds: 0,         
  temperature: 0, 
  humidity: 0,   
  relayStatus: false,
};

// =====================
// Real-time Listener Firebase
// =====================

// Listener untuk data Sensor
db.ref('Sensor').on('value', (snapshot) => {
  const data = snapshot.val();
  if (data) {
    cache.tds = data.tds || 0;
    cache.temperature = data.temperature || 0;
    cache.humidity = data.humidity || 0;
    console.log('Data sensor diperbarui secara real-time:', cache);
  }
}, (error) => {
  console.error('Error membaca data sensor secara real-time:', error);
});

// Listener untuk status relay
db.ref('Control/relay').on('value', (snapshot) => {
  cache.relayStatus = snapshot.val() || false;
  console.log('Status relay diperbarui secara real-time:', cache.relayStatus);
}, (error) => {
  console.error('Error membaca status relay secara real-time:', error);
});

// =====================
// Endpoint API
// =====================

// Endpoint untuk mendapatkan data sensor
app.get('/api/sensors', (req, res) => {
  res.json({
    tds: cache.tds,
    temperature: cache.temperature,
    humidity: cache.humidity,
  });
});

// Endpoint untuk mendapatkan status relay
app.get('/api/relay', (req, res) => {
  res.json({ relayStatus: cache.relayStatus });
});

// Endpoint untuk memperbarui status relay
app.post('/api/relay', async (req, res) => {
  const { status } = req.body;
  if (typeof status !== 'boolean') {
    return res.status(400).json({ error: 'Invalid status value. Must be boolean.' });
  }

  try {
    await db.ref('Control/relay').set(status);
    cache.relayStatus = status;
    console.log('Relay status diperbarui ke:', status);
    res.json({ success: true, relayStatus: status });
  } catch (error) {
    console.error('Error memperbarui relay:', error);
    res.status(500).json({ success: false, error: 'Gagal memperbarui relay.' });
  }
});

// Endpoint untuk menerima data dari ESP32
app.post('/api/data', (req, res) => {
  const { tds, temperature, humidity, relayStatus } = req.body;

  console.log('Data diterima dari ESP32:', { tds, temperature, humidity, relayStatus });

  // Perbarui data sensor di Firebase
  db.ref('Sensor').set({ tds, temperature, humidity }).catch((error) => {
    console.error('Error memperbarui data sensor di Firebase:', error);
  });

  // Perbarui status relay jika ada
  if (relayStatus !== undefined) {
    db.ref('Control/relay').set(relayStatus).catch((error) => {
      console.error('Error memperbarui status relay di Firebase:', error);
    });
  }

  res.status(200).send('Data berhasil diterima!');
});

// =====================
// Jalankan Server
// =====================
app.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
});
