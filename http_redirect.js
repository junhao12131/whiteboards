// set up plain http server
var app = require('express')();
var http = require('http').Server(app);

// set up a route to redirect http to https
app.get('*', function(req, res) {
  res.redirect('https://' + req.headers.host + req.url);
});

// have it listen on 8080
http.listen(80);
