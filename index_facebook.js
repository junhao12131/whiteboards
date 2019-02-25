var app = require('express')();
var fs = require('fs');

// Certificate
const certDir = './cert/';
const privateKey = fs.readFileSync(certDir + 'privkey.pem', 'utf8');
const certificate = fs.readFileSync(certDir + 'cert.pem', 'utf8');
const ca = fs.readFileSync(certDir + 'chain.pem', 'utf8');

const credentials = {
  key: privateKey,
  cert: certificate,
  ca: ca
};

var https = require('https').Server(credentials, app);
var io = require('socket.io')(https);

var NUM_BOARDS = 4;

var participants = [];
var nextClientId = 0;  // For unique client id.
var pingId = 0;
var pingTime = null;  // For calculating latency.
var boards = null;
var filename = 'boards.json';  // For saving and loading boards.

if (fs.existsSync(filename)) {
  var contents = fs.readFileSync(filename, 'utf8');
  boards = JSON.parse(contents);
} else {
  boards = [];
  for (var i = 0; i < NUM_BOARDS; i++)  boards.push([]);
}

app.get('/facebook123', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});

app.get('/main.js', function (req, res) {
  res.sendFile(__dirname + '/main.js');
});

io.on('connection', function (socket) {
  var clientId = nextClientId;
  nextClientId = nextClientId + 1;

  var lastIndex = null;

  var address = socket.handshake.address;

  participants.push({
    clientId: clientId,
    address: address
  });

  // Find index of clientId in participants.
  var findIndex = function (clientId) {
    if (participants[lastIndex] && participants[lastIndex].clientId === clientId) {
      return lastIndex;
    }
    for (var i = 0; i < participants.length; i++) {
      if (participants[i].clientId === clientId) {
        lastIndex = i;
        return i;
      }
    }
  }

  socket.on('disconnect', function () {
    var index = findIndex(clientId);
    participants.splice(index, 1);
  });

  socket.on('latencyReply', function (msg) {
    if (msg.pingId != pingId) return;
    var index = findIndex(clientId);
    var p = participants[index];
    var rtt = new Date().getTime() - pingTime;
    if (!p.latency) p.latency = 0;
    p.latency = Math.round(rtt * 0.5 + p.latency * 0.25);  // 0.5 Momentum.
  });

  socket.on('draw', function (msg) {
    msg.senderId = clientId;
    socket.broadcast.emit('drawBcast', msg);
    if (msg.elem) boards[msg.boardId].push(msg.elem);
  });

  socket.on('clear', function (msg) {
    msg.senderId = clientId;
    socket.broadcast.emit('clearBcast', msg);
    boards[msg.boardId] = [];
  });

  var loadMsg = {
    clientId: clientId,
    boards: boards
  };
  socket.emit('load', loadMsg);
});

// Periodically ping for latency.
setInterval(function () {
  pingId = pingId + 1;
  pingTime = new Date().getTime();
  io.emit('latency', {
    pingId: pingId,
    participants: participants
  });
}, 2000);

// Periodically save to file.
setInterval(function () {
  fs.writeFile(filename, JSON.stringify(boards), function (err) {
    if (err) {
      console.log(err);
    } else {
      console.log('boards saved.');
    }
  });
}, 3000);

https.listen(443, function () {
  console.log('listening');
});
