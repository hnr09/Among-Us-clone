const SERVER_URL = window.location.origin;

let socket = null;
let playerId = null;
let connectionState = "CONNECTING";

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
        create() {
            this.statusText = this.add.text(
                640,
                360,
                "",
                {
                    fontFamily: "Arial",
                    fontSize: "28px",
                    color: "#ffffff",
                    align: "center"
                }
            ).setOrigin(0.5);

            this.updateStatus();

            // Socket.IO is loaded by index.html before this module.
            if (typeof io !== "function") {
                connectionState = "SOCKET.IO LOAD FAILED";
                this.updateStatus();
                return;
            }

            socket = io(SERVER_URL);

            socket.on("connect", () => {
                connectionState = "CONNECTED";
                this.updateStatus();
            });

            socket.on("server message", (message) => {
                if (Array.isArray(message) && message[0] === "id update") {
                    playerId = message[1];
                    this.updateStatus();
                }
            });

            socket.on("world update", (message) => {
                // Connection test only. World rendering will be added next.
                if (connectionState === "CONNECTED") {
                    this.updateStatus();
                }
            });

            socket.on("disconnect", () => {
                connectionState = "DISCONNECTED";
                this.updateStatus();
            });

            socket.on("connect_error", () => {
                connectionState = "CONNECTION ERROR";
                this.updateStatus();
            });
        },

        updateStatus() {
            if (!this.statusText) return;

            const idText = playerId === null
                ? "Player ID: waiting..."
                : `Player ID: ${playerId}`;

            this.statusText.setText(
                [
                    "AMONG US WEB",
                    "",
                    `Server: ${connectionState}`,
                    idText
                ].join("\n")
            );
        }
    }
};

new Phaser.Game(config);
