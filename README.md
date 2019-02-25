# whiteboards
Simple and realtime whiteboards for remote collaboration based on socket.io.

![Screenshot](https://raw.githubusercontent.com/junhao12131/whiteboards/master/helloworld.png)

## Server side setup
```
npm install
node index.js
```

## Client side usage

The default whiteboard path is
```
[server address]:3000/whiteboard
```
For stylus devices, you can provide a hash tag to allow stylus input only, i.e. 
```
[server address]:3000/whiteboard#stylusOnly
```
