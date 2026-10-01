const http = require("http");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 4321;
const CLIENT_ROOT = path.resolve(__dirname, "../client");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

function serveClientFile(req, res) {
  let requestPath = decodeURIComponent((req.url || "/").split("?")[0]);

  if (requestPath === "/") {
    requestPath = "/index.html";
  }

  const filePath = path.resolve(CLIENT_ROOT, "." + requestPath);

  if (filePath !== CLIENT_ROOT && !filePath.startsWith(CLIENT_ROOT + path.sep)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";

    fs.readFile(filePath, (readError, data) => {
      if (readError) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Internal server error");
        return;
      }

      res.writeHead(200, { "Content-Type": contentType });
      res.end(data);
    });
  });
}

const httpServer = http.createServer((req, res) => {
  // Socket.IO handles its own /socket.io/* requests.
  if ((req.url || "").startsWith("/socket.io/")) {
    return;
  }

  if ((req.url || "").split("?")[0] === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Among Us web server is running.");
    return;
  }

  serveClientFile(req, res);
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

  socket.emit("server message", ["id update", playerId]);

  socket.on("world update", (message) => {
    applyWorldUpdate(message);
    io.emit("world update", publicWorldState());
  });

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
