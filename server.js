const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const port = new SerialPort({ path: 'COM13', baudRate: 115200 });
const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

port.on('error', function(err) {
  console.log('Error: ', err.message);
});

port.on('open', function() {
  console.log('Port opened');
  // Write "init 5000" to the COM port to initiate data transmission
  port.write('battery_charger_misc_read 5000\n', function(err) {
    if (err) {
      return console.log('Error on write: ', err.message);
    }
    console.log('Message written: battery_charger_misc_read 5000');
  });

  parser.on('data', function(data) {
    console.log('Data received: ', data);
    const parsedData = parseData(data);
    io.emit('serialData', parsedData);
  });
});

function parseData(data) {
  const regex = /Vin:\s*(\d+) mV age:\s*(\d+)\. Vbat:\s*(\d+) mV age:\s*(\d+)\. Ibat:\s*([-\d]+) mA age:\s*(\d+)\. cv_timer:\s*(\d+) s age:\s*(\d+)\. max_cv_time:\s*(\d+) s age:\s*(\d+)\./;
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
    };
  }
  return null;
}

// Route to close the serial port
app.get('/close-port', (req, res) => {
  if (port.isOpen) {
    port.close((err) => {
      if (err) {
        return res.status(500).send('Error closing port: ' + err.message);
      }
      res.send('Port closed successfully');
    });
  } else {
    res.send('Port is already closed');
  }
});

server.listen(3000, () => {
  console.log('Listening on port 3000');
});
