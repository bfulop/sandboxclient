import { function as F, reader as R } from 'fp-ts';
import type { Observable } from 'rxjs';
import type { WebSocketSubject } from 'rxjs/webSocket';
import type { Environment } from './index';
import { MouseAction } from './codecs';

export const mouseClicksFlow = F.pipe(
  R.asks<Environment, {clicks: Observable<MouseEvent>, ws: WebSocketSubject<unknown>}>(env => ({clicks: env.clicks, ws: env.ws})),
  R.map(({clicks, ws}) => {
    clicks.subscribe(e => {
      ws.next(MouseAction.encode({ type: 'mouseclick', payload: {x: e.clientX, y: e.clientY - 60} }));
    })
    return clicks;
  })
);
