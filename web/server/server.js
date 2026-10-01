const http = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 4321;

const httpServer = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Among Us web server is running.");
});

const io = new Server(httpServer, {
  cors: { origin: "*" }
});

// This is the web equivalent of the state held in server.py's minionmap.
// The field names intentionally follow the original server.py protocol.
const minionmap = new Map();

function makeMinion(playerId) {
  return {
    player_id: playerId,
    x: 50,
    y: 50,
    sync_img: null,
    sync_img_index: null,
    left_img_index: 0,
    right_img_index: 0,
    up_img_index: 0,
    down_img_index: 0,
    alive_status: true,
    player_colour: null,
    tasks_completed: 0,
    sabotagelights_sync: 0,
    sabotagereactor_sync: 0,
    victim_id: 0,
    imposter: false,
    emergency_sync: 0,
    voted: null,
    got_votes: 0,
    emergency_meeting_img_sync: null,
    emergency_meeting_img_sync_report: null,
    victim_id_report: 0,
    got_reported: false,
    eject_sync: false,
    eject_img: null
  };
}

function publicWorldState() {
  return [
    "player locations",
    ...Array.from(minionmap.values()).map((p) => [
      p.player_id,
      p.x,
      p.y,
      p.alive_status,
      p.sync_img,
      p.sync_img_index,
      p.left_img_index,
      p.right_img_index,
      p.up_img_index,
      p.down_img_index,
      p.player_colour,
      p.tasks_completed,
      p.sabotagelights_sync,
      p.sabotagereactor_sync,
      p.victim_id,
      p.imposter,
      p.emergency_sync,
      p.voted,
      p.got_votes,
      p.emergency_meeting_img_sync,
      p.emergency_meeting_img_sync_report,
      p.victim_id_report,
      p.got_reported,
      p.eject_sync,
      p.eject_img
    ])
  ];
}

function applyWorldUpdate(data) {
  if (!Array.isArray(data) || data.length < 26) return;

  const playerId = Number(data[1]);
  if (!playerId || !minionmap.has(playerId)) return;

  const p = minionmap.get(playerId);

  p.x = data[2];
  p.y = data[3];
  p.alive_status = data[4];
  p.sync_img = data[5];
  p.sync_img_index = data[6];
  p.left_img_index = data[7];
  p.right_img_index = data[8];
  p.up_img_index = data[9];
  p.down_img_index = data[10];
  p.player_colour = data[11];
  p.tasks_completed = data[12];
  p.sabotagelights_sync = data[13];
  p.sabotagereactor_sync = data[14];
  p.victim_id = data[15];
  p.imposter = data[16];
  p.emergency_sync = data[17];
  p.voted = data[18];
  p.got_votes = data[19];
  p.emergency_meeting_img_sync = data[20];
  p.emergency_meeting_img_sync_report = data[21];
  p.victim_id_report = data[22];
  p.got_reported = data[23];
  p.eject_sync = data[24];
  p.eject_img = data[25];
}

io.on("connection", (socket) => {
  let playerId;

  do {
    playerId = Math.floor(Math.random() * 999001) + 1000;
  } while (minionmap.has(playerId));

  playerId = Number(playerId);
  minionmap.set(playerId, makeMinion(playerId));

  // Equivalent to server.py:
  // conn.send(pickle.dumps(['id update', player_id]))
  socket.emit("server message", ["id update", playerId]);

  socket.on("world update", (message) => {
    applyWorldUpdate(message);
    io.emit("world update", publicWorldState());
  });

  // Also accept an object form so the browser client can be easier to debug.
  socket.on("world_update", (message) => {
    if (Array.isArray(message)) {
      applyWorldUpdate(message);
    } else if (message && Array.isArray(message.data)) {
      applyWorldUpdate(message.data);
    }
    io.emit("world update", publicWorldState());
  });

  socket.on("disconnect", () => {
    minionmap.delete(playerId);
    io.emit("world update", publicWorldState());
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Among Us web server listening on port ${PORT}`);
});
