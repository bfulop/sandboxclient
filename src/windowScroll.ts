import { 
  function as F,
  io as IO,
  reader as R,
} from 'fp-ts';
import type { Observable } from 'rxjs';
import type { WebSocketSubject } from 'rxjs/webSocket';
import { map as mapO } from 'fp-ts-rxjs/es6/Observable';
import { MouseAction } from './codecs';
import type { Environment } from './index';
import { fromEvent } from 'rxjs';
import { throttleTime } from 'rxjs/operators';

const getMouseScrollEvents: IO.IO<Observable<MouseAction>> = () =>
  F.pipe(
    fromEvent(window, 'scroll', { passive: true }).pipe(
      throttleTime(80),
      mapO(() => ({
        type: 'windowscroll',
        payload: { x: window.scrollX, y: window.scrollY },
      })),
    ),
  );

function pipeToServer(
  scrollStream: Observable<MouseAction>,
): (ws: WebSocketSubject<unknown>) => void {
  return (ws) => {
    scrollStream.subscribe((e) => {
      ws.next(MouseAction.encode({ type: 'windowscroll', payload: { x: e.payload.x, y: e.payload.y } }));
    });
  }
}

export const windowScroll = F.pipe(
  R.asks<Environment, IO.IO<WebSocketSubject<unknown>>>(env => IO.of(env.ws)),
  R.map(w =>
    F.pipe(IO.of(pipeToServer), IO.ap(getMouseScrollEvents), IO.ap(w)),
  ),
  // !!!! START the IO:
  R.map(io => io())
);
