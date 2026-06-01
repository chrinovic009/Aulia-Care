import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' } })
export class NotificationsGateway {
  @WebSocketServer()
  server: Server;

  notify(event: string, payload: any) {
    try {
      if (this.server) this.server.emit(event, payload);
    } catch (e) {
      // best-effort emit
    }
  }
}
