const SERVER_URL = window.location.origin;
const MAP_WIDTH = 5792;
const MAP_HEIGHT = 3168;
const PLAYER_SPEED = 400; // Original settings.py: PLAYER_SPEED = 400
const FRAME_NUMBERS = [1, 4, 7, 10, 13, 16];
const COLORS = ["Red", "Blue", "Green", "Orange", "Yellow"];
const COLOR_PREFIX = {
    Red: "red",
    Blue: "blue",
    Green: "green",
    Orange: "orange",
    Yellow: "yellow"
};
const DIRECTIONS = ["down", "left", "right", "up"];
const SPAWN_FALLBACK = [3288, 873];

let socket = null;
let playerId = null;
let connectionState = "CONNECTING";
let lastSentAt = 0;

const config = {
    type: Phaser.AUTO,
    width: 1280,
    height: 720,
    parent: "game-container",
    backgroundColor: "#20242a",
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    physics: {
        default: "arcade",
        arcade: { gravity: { y: 0 }, debug: false }
    },
    scene: { preload, create, update }
};

function preload() {
    this.load.image("map", "/assets/maps/map2.png");

    // Load original PNG walk frames from Assets/Images/Player.
    for (const color of COLORS) {
        const folder = COLOR_PREFIX[color];
        for (const direction of DIRECTIONS) {
            for (let i = 0; i < FRAME_NUMBERS.length; i++) {
                const frame = FRAME_NUMBERS[i];
                this.load.image(
                    textureKey(color, direction, i),
                    "/assets/images/Player/" + color + "/" + folder + "_" + direction + "_walk/step" + frame + ".png"
                );
            }
        }
    }
}

function create() {
    this.mapImage = this.add.image(0, 0, "map").setOrigin(0, 0).setDepth(-1);
    this.physics.world.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
    this.cameras.main.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);

    this.players = new Map();
    this.obstacles = [];
    this.collidersReady = false;
    this.lastDirection = "down";
    this.animationElapsed = 0;
    this.animationFrame = 0;

    this.keys = this.input.keyboard.addKeys({
        up: "W", down: "S", left: "A", right: "D",
        arrowUp: "UP", arrowDown: "DOWN", arrowLeft: "LEFT", arrowRight: "RIGHT",
        debug: "H"
    });
    this.showCollisionDebug = false;
    this.debugGraphics = this.add.graphics().setDepth(50000);

    this.statusText = this.add.text(18, 16, "", {
        fontFamily: "Arial",
        fontSize: "18px",
        color: "#ffffff",
        backgroundColor: "rgba(0, 0, 0, 0.72)",
        padding: { left: 10, right: 10, top: 7, bottom: 7 },
        lineSpacing: 3
    }).setScrollFactor(0).setDepth(100000);

    this.helpText = this.add.text(18, 112, "이동: WASD / 방향키   |   H: 히트박스 보기", {
        fontFamily: "Arial",
        fontSize: "16px",
        color: "#ffffff",
        backgroundColor: "rgba(0, 0, 0, 0.55)",
        padding: { left: 8, right: 8, top: 5, bottom: 5 }
    }).setScrollFactor(0).setDepth(100000);

    updateStatus(this);
    loadOriginalMapColliders(this);

    if (typeof io !== "function") {
        connectionState = "SOCKET.IO LOAD FAILED";
        updateStatus(this);
        return;
    }

    socket = io(SERVER_URL);
    socket.on("connect", () => {
        connectionState = "CONNECTED";
        updateStatus(this);
    });

    socket.on("server message", (message) => {
        if (Array.isArray(message) && message[0] === "id update") {
            playerId = Number(message[1]);
            const x = Number(message[2]);
            const y = Number(message[3]);
            const startX = Number.isFinite(x) && x > 0 ? x : SPAWN_FALLBACK[0];
            const startY = Number.isFinite(y) && y > 0 ? y : SPAWN_FALLBACK[1];
            ensurePlayer(this, playerId, startX, startY, colorForId(playerId), true);
            this.cameras.main.startFollow(this.players.get(playerId), true, 1, 1);
            updateStatus(this);
        }
    });

    socket.on("world update", (world) => {
        if (!Array.isArray(world) || world[0] !== "player locations") return;

        for (const row of world.slice(1)) {
            if (!Array.isArray(row) || row.length < 4) continue;
            const id = Number(row[0]);
            if (!Number.isFinite(id) || id === playerId) continue;

            const x = Number(row[1]);
            const y = Number(row[2]);
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

            const color = COLORS.includes(row[10]) ? row[10] : colorForId(id);
            const player = ensurePlayer(this, id, x, y, color, false);
            player.setPosition(x, y);
            player.setDepth(y + player.body.height);
            player.playerAlive = row[3] !== false;
            player.setAlpha(player.playerAlive ? 1 : 0.45);
        }
        updateStatus(this);
    });

    socket.on("disconnect", () => {
        connectionState = "DISCONNECTED";
        updateStatus(this);
    });
    socket.on("connect_error", () => {
        connectionState = "CONNECTION ERROR";
        updateStatus(this);
    });
}

function update(time, delta) {
    if (Phaser.Input.Keyboard.JustDown(this.keys.debug)) {
        this.showCollisionDebug = !this.showCollisionDebug;
    }
    renderCollisionDebug(this);
    if (playerId === null || !this.players) return;
    const player = this.players.get(playerId);
    if (!player) return;

    let dx = 0;
    let dy = 0;
    if (this.keys.left.isDown || this.keys.arrowLeft.isDown) dx -= 1;
    if (this.keys.right.isDown || this.keys.arrowRight.isDown) dx += 1;
    if (this.keys.up.isDown || this.keys.arrowUp.isDown) dy -= 1;
    if (this.keys.down.isDown || this.keys.arrowDown.isDown) dy += 1;

    const hasInput = dx !== 0 || dy !== 0;
    let didMove = false;

    if (hasInput) {
        const length = Math.hypot(dx, dy);
        dx /= length;
        dy /= length;

        // Match the original game's diagonal-facing behavior: horizontal wins
        // ties, so diagonal input does not make the character flicker vertically.
        if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) {
            this.lastDirection = dx < 0 ? "left" : "right";
        } else if (dy !== 0) {
            this.lastDirection = dy < 0 ? "up" : "down";
        }

        // Mirror sprites.py: Player.update() applies the full frame movement,
        // then resolves X and Y collisions separately against the first
        // overlapping obstacle, snapping the player to that rectangle's edge.
        const distance = PLAYER_SPEED * (Math.max(delta, 0) / 1000);
        const moveX = dx * distance;
        const moveY = dy * distance;

        if (moveX !== 0) {
            player.x += moveX;
            const hitX = firstOverlappingObstacle(this, player.x, player.y, player.displayWidth, player.displayHeight);
            if (hitX) {
                if (moveX > 0) player.x = hitX.x - player.displayWidth;
                else player.x = hitX.x + hitX.width;
            }
            didMove = true;
        }

        if (moveY !== 0) {
            player.y += moveY;
            const hitY = firstOverlappingObstacle(this, player.x, player.y);
            if (hitY) {
                if (moveY > 0) player.y = hitY.y - player.displayHeight;
                else player.y = hitY.y + hitY.height;
            }
            didMove = true;
        }
    }

    // Advance frames only while the character is actually moving. Retain the
    // remainder so animation speed stays consistent across different FPS.
    if (didMove) {
        this.animationElapsed += Math.min(Math.max(delta, 0), 50);
        while (this.animationElapsed >= 95) {
            this.animationElapsed -= 95;
            this.animationFrame = (this.animationFrame + 1) % FRAME_NUMBERS.length;
        }
    } else {
        this.animationFrame = 0;
        this.animationElapsed = 0;
    }

    player.setTexture(textureKey(player.playerColor, this.lastDirection, this.animationFrame));
    // Sort by the feet, not the sprite center, for correct top-down depth.
    player.setDepth(player.y + player.displayHeight);

    if (socket && socket.connected && time - lastSentAt >= 50) {
        lastSentAt = time;
        socket.emit("world update", makePlayerUpdate(player, this));
    }
}

function textureKey(color, direction, frameIndex) {
    return "player-" + color.toLowerCase() + "-" + direction + "-" + frameIndex;
}

function colorForId(id) {
    const safeId = Number.isFinite(Number(id)) ? Math.abs(Number(id)) : 0;
    return COLORS[safeId % COLORS.length];
}

function ensurePlayer(scene, id, x, y, color, local) {
    let player = scene.players.get(id);
    if (!player) {
        const initialColor = COLORS.includes(color) ? color : colorForId(id);
        player = scene.physics.add.image(x, y, textureKey(initialColor, "down", 0));
        // Original sprites.py uses image.get_rect() without resizing and stores
        // pos as the rectangle's top-left, so keep native PNG dimensions and
        // top-left coordinates instead of a custom centered 28x40 hitbox.
        player.setOrigin(0, 0);
        // Render the source frames at half size to match the original 32 px map tiles.
        player.setScale(0.5);
        player.setDepth(y);
        player.playerId = id;
        player.playerColor = initialColor;
        player.playerAlive = true;
        player.isLocalPlayer = local;
        const source = player.texture.getSourceImage();
        player.body.setSize(source.width, source.height);
        player.body.setAllowGravity(false);
        player.body.setImmovable(true);
        scene.players.set(id, player);
    } else if (COLORS.includes(color) && player.playerColor !== color) {
        player.playerColor = color;
    }
    return player;
}

function makePlayerUpdate(player, scene) {
    const direction = scene.lastDirection || "down";
    const frame = scene.animationFrame || 0;
    return [
        "player update",
        player.playerId,
        Math.round(player.x),
        Math.round(player.y),
        player.playerAlive !== false,
        "player-" + player.playerColor.toLowerCase() + "-" + direction,
        "[" + frame + "]",
        direction === "left" ? frame : 0,
        direction === "right" ? frame : 0,
        direction === "up" ? frame : 0,
        direction === "down" ? frame : 0,
        player.playerColor,
        0, 0, 0, 0, false, 0, null, 0, null, null, 0, false, false, null
    ];
}

async function loadOriginalMapColliders(scene) {
    try {
        const response = await fetch("/assets/maps/map.tmx");
        if (!response.ok) throw new Error("map.tmx returned " + response.status);
        const xmlText = await response.text();
        const xml = new DOMParser().parseFromString(xmlText, "application/xml");
        const groups = Array.from(xml.getElementsByTagName("objectgroup"));
        const obstaclesGroup = groups.find((group) => group.getAttribute("name") === "Obstacles");
        if (!obstaclesGroup) throw new Error('TMX object group "Obstacles" was not found');

        // Match the obstacle names used by the original Python game.py.
        // Unnamed TMX objects are task/spawn/interaction markers, not walls;
        // treating them as solid creates invisible barriers in the web port.
        const solidNames = new Set([
            "walls", "wall", "tables", "props", "generator",
            "medbay_comp", "engines", "reactor", "security_room_comp",
            "admin_btn1", "admin_btn2"
        ]);
        // Use the exact rectangular obstacle coordinates from the original
        // game's TMX object group. Keep rendering separate from collision data:
        // this map's Props/Walls tile layers are empty, so those object boxes
        // must not be treated as image crops.
        scene.obstacles = Array.from(obstaclesGroup.getElementsByTagName("object"))
            .filter((object) => solidNames.has((object.getAttribute("name") || "").toLowerCase()))
            .map((object) => ({
                name: (object.getAttribute("name") || "").toLowerCase(),
                x: Number(object.getAttribute("x") || 0),
                y: Number(object.getAttribute("y") || 0),
                width: Number(object.getAttribute("width") || 0),
                height: Number(object.getAttribute("height") || 0)
            }))
            .filter((rect) => rect.width > 0 && rect.height > 0);

        scene.collidersReady = true;
        updateStatus(scene);
    } catch (error) {
        console.error("Could not load original TMX collision objects:", error);
        scene.collisionError = true;
        updateStatus(scene);
    }
}

function renderCollisionDebug(scene) {
    if (!scene.debugGraphics) return;
    const graphics = scene.debugGraphics;
    graphics.clear();
    if (!scene.showCollisionDebug) return;

    // Red: original map's solid object rectangles.
    graphics.lineStyle(2, 0xff3b30, 0.95);
    for (const rect of scene.obstacles || []) {
        graphics.strokeRect(rect.x, rect.y, rect.width, rect.height);
    }

    // Cyan: the current player collision box used by hitsObstacle().
    const player = playerId !== null && scene.players ? scene.players.get(playerId) : null;
    if (player) {
        graphics.lineStyle(2, 0x00e5ff, 1);
        graphics.strokeRect(player.x, player.y, player.displayWidth, player.displayHeight);
        graphics.fillStyle(0x00e5ff, 0.12);
        graphics.fillRect(player.x, player.y, player.displayWidth, player.displayHeight);
    }
}

function firstOverlappingObstacle(scene, x, y, width, height) {
    // pygame.sprite.spritecollide() checks the Player rect against the
    // invisible Obstacle rects in group order. The original Player rect is
    // image.get_rect() at its top-left position, with the image's native size.
    for (const rect of scene.obstacles) {
        if (
            x + width > rect.x &&
            x < rect.x + rect.width &&
            y + height > rect.y &&
            y < rect.y + rect.height
        ) return rect;
    }
    return null;
}

function updateStatus(scene) {
    if (!scene.statusText) return;
    const idText = playerId === null ? "Player ID: waiting..." : "Player ID: " + playerId;
    const collisionText = scene.collidersReady
        ? "Original TMX collision: " + scene.obstacles.length + " objects"
        : scene.collisionError ? "Collision map: load failed" : "Loading original collision map...";
    scene.statusText.setText([
        "AMONG US WEB",
        "Server: " + connectionState,
        idText,
        collisionText,
        "Players: " + (scene.players ? scene.players.size : 0)
    ].join("\n"));
}

new Phaser.Game(config);
