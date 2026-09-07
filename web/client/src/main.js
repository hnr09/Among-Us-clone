
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
            gravity: {
                y: 0
            },

            debug: false
        }
    },

    scene: {
        create() {

            this.add.text(
                640,
                300,
                "AMONG US WEB",
                {
                    fontFamily: "Arial",
                    fontSize: "64px",
                    color: "#ffffff"
                }
            ).setOrigin(0.5);

            this.add.text(
                640,
                380,
                "Web version starting...",
                {
                    fontFamily: "Arial",
                    fontSize: "24px",
                    color: "#aaaaaa"
                }
            ).setOrigin(0.5);

        }
    }
};

new Phaser.Game(config);
