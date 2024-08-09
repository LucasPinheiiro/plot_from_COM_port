const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const { exec } = require('child_process');

const dataFilePath = 'plotData.json';
const COMMAND = 'battery_charger_misc_read 5000';  // Default command

let plotData = {
  labels: [],
  vbat: [],
  ibat: [],
  soc: []
};

// Function to parse data from the serial port
function parseData(data) {
  const regex = /Vin:\s*(\d+) mV age:\s*(\d+)\. Vbat:\s*(\d+) mV age:\s*(\d+)\. Ibat:\s*([-\d]+) mA age:\s*(\d+)\. cv_timer:\s*(\d+) s age:\s*(\d+)\. max_cv_time:\s*(\d+) s age:\s*(\d+)\.?( soc:\s*(\d+)\.)?/;
  const match = data.match(regex);
  if (match) {
    return {
      Vin: parseInt(match[1]),
      VinAge: parseInt(match[2]) / 1000, // Convert milliseconds to seconds
      Vbat: parseInt(match[3]),
      VbatAge: parseInt(match[4]) / 1000, // Convert milliseconds to seconds
      Ibat: parseInt(match[5]),
      IbatAge: parseInt(match[6]) / 1000, // Convert milliseconds to seconds
      cvTimer: parseInt(match[7]),
      cvTimerAge: parseInt(match[8]) / 1000, // Convert milliseconds to seconds
      maxCvTime: parseInt(match[9]),
      maxCvTimeAge: parseInt(match[10]) / 1000, // Convert milliseconds to seconds
      soc: match[12] ? parseInt(match[12]) : null
    };
  }
  return null;
}

// Load plot data from file if it exists
if (fs.existsSync(dataFilePath)) {
  try {
    const rawData = fs.readFileSync(dataFilePath);
    plotData = JSON.parse(rawData);
  } catch (err) {
    console.error('Error reading plotData.json:', err);
    plotData = { labels: [], vbat: [], ibat: [], soc: [] };
    fs.writeFileSync(dataFilePath, JSON.stringify(plotData, null, 2));
  }
}

// Check if plotData is empty and populate it with the initial structure
if (!plotData.labels || plotData.labels.length === 0) {
  plotData = { labels: [], vbat: [], ibat: [], soc: [] };
  fs.writeFileSync(dataFilePath, JSON.stringify(plotData, null, 2));
}

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint to serve the initial plot data
app.get('/initial-data', (req, res) => {
  res.json(plotData);
});

app.get('/calculate-capacity', (req, res) => {
  exec('py calculate_capacity.py', (error, stdout, stderr) => {
    if (error) {
      console.error(`Error executing Python script: ${error}`);
      return res.status(500).json({ error: 'Error calculating capacity' });
    }
    const output = stdout.trim();
    const [capacity, action] = output.split(' ');

    res.json({
      capacity: `${capacity} mAh`,
      action: action === 'charging' ? 'charging' : 'discharging',
    });
  });
});

// Endpoint to reset data
app.post('/reset-data', (req, res) => {
  plotData = { labels: [], vbat: [], ibat: [], soc: [] };
  fs.writeFileSync(dataFilePath, JSON.stringify(plotData, null, 2));
  res.send('Data reset');
});

const port = new SerialPort({ path: 'COM13', baudRate: 115200 });
const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

port.on('error', function(err) {
  console.log('Error: ', err.message);
});

port.on('open', function() {
  console.log('Port opened');

  parser.on('data', function(data) {
    console.log('Data received: ', data);
    io.emit('commandResponse', data); // Emit raw data for the console
    const parsedData = parseData(data);
    if (parsedData) {
      plotData.labels.push(parsedData.VbatAge);
      plotData.vbat.push(parsedData.Vbat);
      plotData.ibat.push(parsedData.Ibat);
      plotData.soc.push(parsedData.soc);
      fs.writeFileSync(dataFilePath, JSON.stringify(plotData, null, 2));
      io.emit('serialData', parsedData); // Emit parsed data for the plot
    }
  });
});

io.on('connection', (socket) => {
  console.log('Client connected');

  socket.on('sendCommand', (command) => {
    console.log(`Command received: ${command}`);
    port.write(`${command}\n`, function(err) {
      if (err) {
        console.log('Error on write: ', err.message);
      } else {
        console.log(`Command sent: ${command}`);
      }
    });
  });
});

server.listen(3000, () => {
  console.log('Listening on port 3000');
});
