import { Injectable, Logger } from '@nestjs/common';
import net from "net";
import { ENVConfigService } from "@orbiter-finance/config";
@Injectable()
export class TcpService {
  private readonly logger = new Logger(TcpService.name);

  constructor(private readonly envConfigService: ENVConfigService) {
  }

  async start(callback: (msg) => void) {
    const _this = this;
    const port = await this.envConfigService.getAsync('TCP_PORT');
    if (!port) {
      _this.logger.error("TCP_PORT not configured");
      return;
    }
    const server = new net.Server();
    server.listen(port, function () {
      _this.logger.debug(`TCP Server listening for connection requests on socket localhost:${port}`);
    });
    server.on('connection', function (socket) {
      _this.logger.debug(`TCP Server Client connection`);
      // Now that a TCP connection has been established, the server can send data to
      // the client by writing to its socket.
      // The server can also receive data from the client by reading from its socket.
      socket.on('data', (chunk) => {
        try {
          callback(JSON.parse(chunk.toString()));
        } catch (error) {
          _this.logger.error(`TCP Server receive handle error: ${error.message}`);
        }
      });

      // When the client requests to end the TCP connection with the server, the server
      // ends the connection.
      socket.on('end', () => {
        _this.logger.error('TCP Server Closing connection with the client...');
      });

      // Don't forget to catch error, for your own sake.
      socket.on('error', (err) => {
        _this.logger.error('TCP Server error', err);
      });
    });
  }
}
