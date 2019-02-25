var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var fs = require('fs');

var NUM_BOARDS = 4;

var participants = [];
var nextClientId = 0;
var pingId = 0;
var pingTime = null;
var boards = null;
var filename = 'boards.json';

if (fs.existsSync(filename)) {
  var contents = fs.readFileSync(filename, 'utf8');
  boards = JSON.parse(contents);
} else {
  boards = [];
  for (var i = 0; i < NUM_BOARDS; i++)  boards.push([]);
}

app.get('/', function (req, res) {
  res.send('Hello World');
});

app.get('/whiteboard', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});

app.get('/whiteboard/main.js', function (req, res) {
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
    p.latency = Math.round(rtt * 0.5 + p.latency * 0.25);
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

setInterval(function () {
  pingId = pingId + 1;
  pingTime = new Date().getTime();
  io.emit('latency', {
    pingId: pingId,
    participants: participants
  });
}, 2000);

setInterval(function () {
  fs.writeFile(filename, JSON.stringify(boards), function (err) {
    if (err) {
      console.log(err);
    } else {
      console.log('boards saved.');
    }
  });
}, 3000);

http.listen(3000, function () {
  console.log('listening on *:3000');
});
