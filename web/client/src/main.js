const SERVER_URL = window.location.origin;

let socket = null;
let playerId = null;
let connectionState = "CONNECTING";

const MAP_WIDTH = 5792;
const MAP_HEIGHT = 3168;

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
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },

    scene: {
        preload() {
            this.load.image("map", "/assets/maps/map2.png");
        },

        create() {
            this.mapImage = this.add.image(0, 0, "map").setOrigin(0, 0);

            this.cameras.main.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
            this.cameras.main.setZoom(0.22);
            this.cameras.main.centerOn(MAP_WIDTH / 2, MAP_HEIGHT / 2);

            this.statusText = this.add.text(
                20,
                20,
                "",
                {
                    fontFamily: "Arial",
                    fontSize: "20px",
                    color: "#ffffff",
                    backgroundColor: "rgba(0, 0, 0, 0.65)",
                    padding: { left: 10, right: 10, top: 6, bottom: 6 }
                }
            ).setScrollFactor(0);

            updateStatus(this);

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
                    playerId = message[1];
                    updateStatus(this);
                }
            });

            socket.on("world update", () => {
                if (connectionState === "CONNECTED") {
                    updateStatus(this);
                }
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
    }
};

function updateStatus(scene) {
    if (!scene.statusText) return;

    const idText = playerId === null
        ? "Player ID: waiting..."
        : `Player ID: ${playerId}`;

    scene.statusText.setText(
        [
            "AMONG US WEB",
            `Server: ${connectionState}`,
            idText
        ].join("\n")
    );
}

new Phaser.Game(config);
