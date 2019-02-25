'use strict';

var whiteboard = {};

// Network module.
(function (whiteboard, document) {
  var socket = io();

  whiteboard.sendDraw = function (msg) {
    socket.emit('draw', msg);
  };

  whiteboard.sendClear = function (msg) {
    socket.emit('clear', msg);
  };

  socket.on('load', function (msg) {
    whiteboard.clientId = msg.clientId;
    whiteboard.loadBoards(msg.boards);
  });

  socket.on('drawBcast', function (msg) {
    whiteboard.draw(msg.senderId, msg.boardId, msg.elem, msg.canary);
  });

  socket.on('clearBcast', function (msg) {
    whiteboard.clear(msg.senderId, msg.boardId);
  });

  socket.on('latency', function (msg) {
    socket.emit('latencyReply', { pingId: msg.pingId });
    var container = document.querySelector('#participants');
    while (container.firstChild) container.removeChild(container.firstChild);
    for (var p of msg.participants) {
      var elem = document.createElement('span');
      var text = p.address;
      if (p.latency) text += ` (${p.latency} ms)`;
      if (p.clientId === whiteboard.clientId) text += ' [current]';
      elem.appendChild(document.createTextNode(text));
      container.appendChild(elem);
    }
  });
})(whiteboard, document);

// Utils module.
(function (whiteboard) {
  var utils = {};

  utils.shallowCopy = function (object) {
    return Object.assign({}, object);
  };

  utils.getDist = function (p1, p2) {
    var dx = p1.x - p2.x;
    var dy = p2.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  utils.getMidPoint = function (p1, p2) {
    return {
      x: (p1.x + p2.x) / 2,
      y: (p1.y + p2.y) / 2
    };
  };

  utils.getWidth = function (size, speed) {
    return size;
  };

  utils.isStylus = function (e) {
    return e.touches && e.touches[0].touchType === 'stylus';
  };

  whiteboard.utils = utils;
})(whiteboard);

// Canvas module.
(function (whiteboard, document) {
  var COLOR = {
    BLACK: 'rgba(33, 33, 33, 1)',
    RED: 'rgba(219, 50, 54, 1)',
    GREEN: 'rgba(60, 186, 84, 1)',
    BLUE: 'rgba(72, 100, 235, 1)',
    WHITE: 'rgba(255, 255, 255, 0.3)'
  };
  var COLORS = ['BLACK', 'RED', 'GREEN', 'BLUE', 'WHITE'];

  var SIZE = {
    DRAW: 2,
    ERASE: 40
  };

  var uiCanvas = document.querySelector('#board');
  var uiCtx = uiCanvas.getContext('2d');
  var memCanvas = document.createElement('canvas');
  memCanvas.height = uiCanvas.height;
  memCanvas.width = uiCanvas.width;
  var memCtx = memCanvas.getContext('2d');

  // For retina.
  uiCanvas.width *= 2;
  uiCanvas.height *= 2;
  uiCanvas.style.width = (uiCanvas.width / 2) + 'px';
  uiCanvas.style.height = (uiCanvas.height / 2) + 'px';
  uiCtx.scale(2, 2);
  memCanvas.width = uiCanvas.width;
  memCanvas.height = uiCanvas.height;
  memCtx.scale(2, 2);

  var status = {
    boardId: 0,
    colorId: 0,
    color: COLOR.BLACK,
    size: SIZE.DRAW,
    position: {
      x: 0,
      y: 0
    },
    touching: false,
    stylusOnly: false,
    points: [],
    canaries: []
  };

  var boards = null;

  whiteboard.loadBoards = function (lastBoards) {
    boards = lastBoards;
    loadBoard(status.boardId);
  };

  whiteboard.draw = function (senderId, boardId, elem, canary) {
    if (elem) boards[boardId].push(elem);
    removeCanaryBySender(senderId);
    if (canary) status.canaries.push(canary);
    if (boardId !== status.boardId) return;
    if (elem) {
      var color = getColorById(elem.colorId);
      drawElement(elem.points, color, elem.size, memCtx);
    }
    loadMem();
    drawCanaries();
  };

  whiteboard.clear = function (senderId, boardId) {
    removeCanaryBySender(senderId);
    removeCanaryByBoard(boardId);
    boards[boardId] = [];
    if (boardId !== status.boardId) return;
    clearCtx(uiCtx);
    clearCtx(memCtx);
  };

  var removeCanaryBySender = function (senderId) {
    for (var i = 0; i < status.canaries.length; i++) {
      if (status.canaries[i].senderId === senderId) {
        status.canaries.splice(i, 1);
        break;
      }
    }
  };

  var removeCanaryByBoard = function (boardId) {
    for (var i = 0; i < status.canaries.length; i++) {
      if (status.canaries[i].boardId === boardId) {
        status.canaries.splice(i, 1);
        i--;
      }
    }
  };

  var drawCanaries = function () {
    for (var canary of status.canaries) {
      if (canary.boardId !== status.boardId) continue;
      var color = getColorById(canary.colorId);
      drawElement(canary.points, color, canary.size, uiCtx);
    }
  };

  var getColorById = function (colorId) {
    return COLOR[COLORS[colorId]];
  };

  var drawDot = function (p, color, size, ctx) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, size * 0.5, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.fill();
  };

  var drawLine = function (p1, p2, color, size, ctx) {
    if (color === COLOR.WHITE) {
      drawDot(p1, color, size, ctx);
      drawDot(p2, color, size, ctx);
    }
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineWidth = size;
    ctx.stroke();
  };

  var drawCurve = function (p1, p2, p3, color, size, ctx) {
    if (color === COLOR.WHITE) {
      drawDot(p1, color, size, ctx);
      drawDot(p3, color, size, ctx);
    }
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.quadraticCurveTo(p2.x, p2.y, p3.x, p3.y);
    ctx.lineWidth = size;
    ctx.stroke();
  }

  var updateMousePosition = function (e) {
    if (!e) var e = event;
    if (e.offsetX) {
      status.position.x = e.offsetX;
      status.position.y = e.offsetY;
    }
    else if (e.layerX) {
      status.position.x = e.layerX;
      status.position.y = e.layerY;
    }
  };

  var clearCtx = function (ctx) {
    ctx.clearRect(0, 0, uiCanvas.width, uiCanvas.height);
  };

  var loadMem = function () {
    clearCtx(uiCtx);
    uiCtx.drawImage(memCanvas, 0, 0, memCanvas.width / 2, memCanvas.height / 2);
  };

  var drawElement = function (points, color, size, ctx) {
    var n = Object.keys(points).length;
    if (n === 1) {
      drawDot(points[0], color, size, ctx);
    } else if (n === 2) {
      drawLine(points[0], points[1], color, size, ctx);
    } else {
      drawCurve(points[0], points[1], points[2], color, size, ctx);
    }
  };

  var loadBoard = function (boardId) {
    clearCtx(uiCtx);
    clearCtx(memCtx);
    for (var elem of boards[boardId]) {
      var color = getColorById(elem.colorId);
      drawElement(elem.points, color, elem.size, uiCtx);
      drawElement(elem.points, color, elem.size, memCtx);
    }
    drawCanaries();
  };

  var touchstartHandler = function (e) {
    e.preventDefault();
    if (status.stylusOnly && !whiteboard.utils.isStylus(e)) return;
    status.touching = true;
    updateMousePosition(e);
    var color = status.color;
    drawDot(status.position, color, status.size, uiCtx);
    var canary = {
      senderId: whiteboard.clientId,
      boardId: status.boardId,
      points: [whiteboard.utils.shallowCopy(status.position)],
      colorId: status.colorId,
      size: status.size
    };
    whiteboard.sendDraw({ boardId: status.boardId, canary: canary });
    status.points.push(whiteboard.utils.shallowCopy(status.position));
    status.canaries.push(canary);
  };

  var touchmoveHandler = function (e) {
    e.preventDefault();
    if (!status.touching) return;
    updateMousePosition(e);
    var color = status.color;
    status.points.push(whiteboard.utils.shallowCopy(status.position));
    var n = Object.keys(status.points).length;
    var canary = {
      senderId: whiteboard.clientId,
      boardId: status.boardId
    };
    removeCanaryBySender(whiteboard.clientId);
    if (n < 4) {
      loadMem();
      canary.points = whiteboard.utils.shallowCopy(status.points);
      canary.colorId = status.colorId;
      canary.size = status.size;
      drawElement(status.points, color, status.size, uiCtx);
      status.canaries.push(canary);
      whiteboard.sendDraw({ boardId: status.boardId, canary: canary });
    } else if (n >= 4) {
      var startPoint = status.points[0];
      if (n > 4) {
        startPoint = whiteboard.utils.getMidPoint(status.points[n - 4], status.points[n - 3]);
      }
      var endPoint = whiteboard.utils.getMidPoint(status.points[n - 3], status.points[n - 2]);
      drawCurve(startPoint, status.points[n - 3], endPoint, color, status.size, memCtx);
      loadMem();
      var elem = {
        points: [startPoint, status.points[n - 3], endPoint],
        colorId: status.colorId,
        size: status.size
      };
      boards[status.boardId].push(elem);
      canary.points = [endPoint, status.points[n - 2], status.points[n - 1]];
      canary.colorId = elem.colorId;
      canary.size = elem.size;
      status.canaries.push(canary);
      whiteboard.sendDraw({ boardId: status.boardId, elem: elem, canary: canary });
      drawCanaries();
    }
  };

  var touchendHandler = function (e) {
    e.preventDefault();
    if (!status.touching) return;
    status.touching = false;
    var n = Object.keys(status.points).length;
    removeCanaryBySender(whiteboard.clientId);
    var color = status.color;
    if (n <= 3) {
      var elem = {
        points: status.points,
        colorId: status.colorId,
        size: status.size
      };
      boards[status.boardId].push(elem);
      whiteboard.sendDraw({ boardId: status.boardId, elem: elem });
      drawElement(elem.points, color, elem.size, memCtx);
    } else {
      var lastPoint = whiteboard.utils.getMidPoint(status.points[n - 3], status.points[n - 2]);
      var elem = {
        points: [lastPoint, status.points[n - 2], status.points[n - 1]],
        colorId: status.colorId,
        size: status.size
      };
      boards[status.boardId].push(elem);
      whiteboard.sendDraw({ boardId: status.boardId, elem: elem });
      drawElement(elem.points, color, elem.size, memCtx);
    }
    status.points = [];
  };

  var init = function () {
    document.querySelector('#clear').addEventListener('click', function () {
      var confirmMsg = 'You are about to clear this board.\n' +
        'It cannot be restored at a later time! Continue?';
      if (!confirm(confirmMsg)) return;
      clearCtx(uiCtx);
      clearCtx(memCtx);
      boards[status.boardId] = [];
      whiteboard.sendClear({ boardId: status.boardId });
      if (status.colorId === COLORS.indexOf('WHITE')) {
        document.querySelector('#action-black').click();
      }
    });

    var actionRadios = document.querySelectorAll('input[type=radio][name=action-id]');
    for (var radio of actionRadios) {
      radio.addEventListener('click', function () {
        if (this.value === 'erase') {
          status.colorId = COLORS.indexOf('WHITE');
          status.size = SIZE.ERASE;
        } else {
          status.colorId = COLORS.indexOf(this.value.toUpperCase());
          status.size = SIZE.DRAW;
        }
        status.color = getColorById(status.colorId);
      });
    }

    uiCanvas.addEventListener('mousedown', touchstartHandler, false);
    uiCanvas.addEventListener('touchstart', touchstartHandler, false);
    uiCanvas.addEventListener('mousemove', touchmoveHandler, false);
    uiCanvas.addEventListener('touchmove', touchmoveHandler, false);
    uiCanvas.addEventListener('mouseup', touchendHandler, false);
    uiCanvas.addEventListener('touchend', touchendHandler, false);

    var boardRadios = document.querySelectorAll('input[type=radio][name=board-id]');
    for (var radio of boardRadios) {
      radio.addEventListener('click', function () {
        var boardId = parseInt(this.value);
        status.boardId = boardId;
        loadBoard(boardId);
      });
    }

    if (location.hash.indexOf('stylusOnly') != -1) {
      status.stylusOnly = true;
    };

    document.querySelector('#download').addEventListener('click', function (e) {
      e.preventDefault();
      var link = document.createElement('a');
      link.download = `board${status.boardId + 1}.png`;
      link.href = uiCanvas.toDataURL();
      link.click();
    });
  };

  init();
})(whiteboard, document);
