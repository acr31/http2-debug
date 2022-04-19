var util = require("util");
class Http2Debug {
  constructor() {
    this.setModules();
    this.i = 0;
  }
  log() {}
  setModules() {
    this.tryToSetModule("http2");
    this.tryToSetModule("fs");
    this.tryToSetModule("os");
    this.tryToSetModule("path");
  }
  tryToSetModule(name) {
    try {
      this[name] = require(name);
    } catch (err) {
      console.error(`
            We cannot require('${name}').
            It might be that the Nodejs version you are using 
            Is not comptible with this module.
            Try to install the latest LTS Node version.
            `);
      throw new Error(`We couldn't require('${name}')`);
    }
  }
  getServerConfig() {
    const args = process.argv.splice(2);
    const userRequest = {};
    args
      .map((args) => args.replace("--", "").split("="))
      .forEach((pair) => {
        userRequest[pair[0]] = pair[1];
      });

    const config = {
      port: parseInt(userRequest.port || process.env.HTTP2_PORT || 8443),
      host: userRequest.host || process.env.HTTP2_HOST || "0.0.0.0",
      key:
        userRequest.key ||
        process.env.HTTP2_TLS_PRIVATE_KEY ||
        this.path.join(__dirname, "..", "assets", "key.pem"),
      cert:
        userRequest.cert ||
        process.env.HTTP2_TLS_CERT ||
        this.path.join(__dirname, "..", "assets", "cert.pem"),
    };
    return config;
  }

  createServer(cb) {
    const config = this.getServerConfig();
    const server = this.http2.createSecureServer({
      key: this.fs.readFileSync(config.key),
      cert: this.fs.readFileSync(config.cert),
    });

    server.on("connection", (socket) => {
      this.log(`New TCP connection: key=#${socket._server._connectionKey}`);
    });
    server.on("request", (request, response) => {
      this.log(`Request on stream id = ${request.stream.id}`);
    });
    server.on("sessionError", (err) => {
      this.log(`Session Error: ${err.message}`);
    });
    server.on("session", (session) => {
      this.log(`New session`);
      session.on("close", () =>
        this.log(`Session closed`)
      );
      session.on("connect", (session, socket) => this.log(`Session connect`));
      session.on("frameError", (err) =>
        this.log(`Session frame error ${util.inspect(err)}`)
      );
      session.on("goaway", (err) =>
        this.log(`Session goaway ${util.inspect(err)}`)
      );
      session.on("localSettings", (settings) =>
        this.log(`Session local settings`)
      );
      session.on("remoteSettings", (settings) =>
        this.log(`Session remote settings`)
      );
      session.on("stream", (stream) => {
        this.log(`New stream id = ${stream.id}`);
        stream.on("aborted", () => {
          this.log(`Stream ${stream.id} is aborted`);
        });
        stream.on("closed", () => {
          this.log(`Stream ${stream.id} is closed`);
        });
        stream.on("ready", () => {
          this.log(`Stream ${stream.id} is ready`);
        });
        var sender = function (index) {
          if (!stream.closed && !stream.aborted && !stream.destroyed) {
            if (index < 10) {
              console.log(`Sending ${stream.id}#${index}`);
              var a = 'data: {"choices": [{"text": "the", "index": 0}]}'
              stream.write(a + "\n\n");
              setTimeout(sender, 500,index+1);
            } else {
              console.log(`Sending done on stream ${stream.id}`);
              stream.write("data: [DONE]\n\n");
              stream.end();
            }
          }
        };
        stream.respond({
            "content-type": "text/event-stream",
            ":status": 200,
          });
        setTimeout(sender, 500,0);
      });
    });
    this.serverSocket = server.listen(config.port, config.host, (err) => {
      this.log(
        `http-debug should be working on http://${config.host}:${config.port}`
      );
      if (cb) cb(err);
    });
  }
  stopServer() {
    if (this.serverSocket) this.serverSocket.close();
    this.serverSocket = null;
  }
}

module.exports = {
  Http2Debug,
};
