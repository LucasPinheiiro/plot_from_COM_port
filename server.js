const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');  // Add path module

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const dataFilePath = 'plotData.json';
const COMMAND = 'battery_charger_misc_read 5000';  // Command to send through the serial port

let plotData = {
  labels: [],
  vbat: [],
  ibat: [],
  soc: []
};

// Function to parse data from the serial port
function parseData(data) {
  const regex = /Vin:\s*(\d+) mV age:\s*(\d+)\. Vbat:\s*(\d+) mV age:\s*(\d+)\. Ibat:\s*([-\d]+) mA age:\s*(\d+)\. cv_timer:\s*(\d+) s age:\s*(\d+)\. max_cv_time:\s*(\d+) s age:\s*(\d+)\. soc:\s*(\d+)\./;
  const match = data.match(regex);
  if (match) {
    return {
      Vin: parseInt(match[1]),
      VinAge: parseInt(match[2]),
      Vbat: parseInt(match[3]),
      VbatAge: parseInt(match[4]),
      Ibat: parseInt(match[5]),
      IbatAge: parseInt(match[6]),
      cvTimer: parseInt(match[7]),
      cvTimerAge: parseInt(match[8]),
      maxCvTime: parseInt(match[9]),
      maxCvTimeAge: parseInt(match[10]),
      soc: parseInt(match[11])
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

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint to serve the initial plot data
app.get('/initial-data', (req, res) => {
  res.json(plotData);
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
  // Write COMMAND to the COM port to initiate data transmission
  port.write(`${COMMAND}\n`, function(err) {
    if (err) {
      return console.log('Error on write: ', err.message);
    }
    console.log(`Message written: ${COMMAND}`);
  });

  parser.on('data', function(data) {
    console.log('Data received: ', data);
    const parsedData = parseData(data);
    if (parsedData) {
      plotData.labels.push(parsedData.VbatAge);
      plotData.vbat.push(parsedData.Vbat);
      plotData.ibat.push(parsedData.Ibat);
      plotData.soc.push(parsedData.soc);
      fs.writeFileSync(dataFilePath, JSON.stringify(plotData, null, 2));
      io.emit('serialData', {
        Vbat: parsedData.Vbat,
        Ibat: parsedData.Ibat,
        VbatAge: parsedData.VbatAge,
        soc: parsedData.soc
      });
    }
  });
});

server.listen(3000, () => {
  console.log('Listening on port 3000');
});
