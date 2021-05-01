import { function as F, reader as R } from 'fp-ts';
import type { WebSocketSubject } from 'rxjs/webSocket';
import type { Environment } from './index';
import { MouseAction } from './codecs';
import { fromEvent } from 'rxjs';

export const mouseClicksFlow = F.pipe(
  R.asks<Environment,  WebSocketSubject<unknown>>(env => env.ws),
  R.map((ws) => {
    const clicks = fromEvent<MouseEvent>(window, 'click');
    clicks.subscribe(e => {
      ws.next(MouseAction.encode({ type: 'mouseclick', payload: {x: e.clientX, y: e.clientY} }));
    })
    return clicks;
  })
);
