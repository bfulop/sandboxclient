import {
  either as E,
  function as F,
  io as IO,
  ioEither as IOE,
  option as O,
  reader as R,
} from 'fp-ts';
import { filterMap, map as mapO } from 'fp-ts-rxjs/es6/Observable';
import type * as RO from 'fp-ts-rxjs/es6/ReaderObservable';
import * as D from 'io-ts/Decoder';
import type { Observable } from 'rxjs';
import { map as rMap, mergeAll, take, windowWhen } from 'rxjs/operators';
import type { WebSocketSubject } from 'rxjs/webSocket';
import type { Environment } from './index';

const MouseMoved = D.type({
  type: D.literal('mousemoved'),
  payload: D.type({
    x: D.number,
    y: D.number,
  })
});

type MouseMoved = D.TypeOf<typeof MouseMoved>

const toMouseEvents = (stream: Observable<unknown>): Observable<MouseMoved> => 
  F.pipe(
  stream,
  mapO(a => MouseMoved.decode(a)),
  filterMap(O.fromEither)
)

const localMouseMoves: RO.ReaderObservable<Environment, MouseMoved> = F.pipe(
  R.asks<Environment, Observable<MessageEvent<unknown>>>(env => env.iframeMessages),
  R.map(rMap(e => e.data)),
  R.map(toMouseEvents)
)

const mouseServerStream = (): RO.ReaderObservable<Environment, MouseMoved> => F.pipe(
  R.asks<Environment, WebSocketSubject<unknown>>(env => env.ws),
  R.map(toMouseEvents)
)

type MouseStreams = {localMouse: Observable<MouseMoved>, remoteMouse: Observable<MouseMoved>}

const mouseServerClientLoop = (localenv: MouseStreams): Observable<MouseMoved> => F.pipe(
  localenv.localMouse,
  windowWhen(() => localenv.remoteMouse),
  rMap(win => win.pipe(take(1))),
  mergeAll()
)

const moveMouse = (mouse: HTMLElement) => (position: {x: number, y: number}) => {
    mouse.style.left = `${position.x}px`;
    mouse.style.top = `${position.y}px`;
}

const safelyGetElement = (id: string): IOE.IOEither<{message: string}, HTMLElement> => () => {
  const element = document.getElementById(id);
  if(element === null) {
    return E.left({message: `element ${id} not found`});
  }
  return E.right(element)
}

const renderMouse = (localenv: MouseStreams): IO.IO<E.Either<{message: string}, MouseStreams>> => F.pipe(
  IOE.bindTo('pointerLocal')(safelyGetElement('pointer-local')),
  IOE.bind('pointerRemote', () => safelyGetElement('pointer-remote')),
  IOE.map(({ pointerLocal, pointerRemote }) => {
    localenv.localMouse.subscribe(e => moveMouse(pointerLocal)(e.payload))
    localenv.remoteMouse.subscribe(e => moveMouse(pointerRemote)(e.payload))
    return localenv;
  })
)

const pushToServer = (throttledMouseEvents: IOE.IOEither< { message: string }, Observable<MouseMoved>>) =>
  F.pipe(
    R.asks<Environment, WebSocketSubject<unknown>>((env: Environment) => env.ws),
    R.map((ws) =>
      F.pipe(
        throttledMouseEvents,
        IOE.map((s) => {
          s.subscribe((e) => {
            ws.next({ type: 'mousemove', x: e.payload.x, y: e.payload.y });
          });
          return s;
        }),
      ),
    ),
  );

export const mouseMovementsFlow = F.pipe(
  R.bindTo('localMouse')(localMouseMoves),
  R.bind('remoteMouse', mouseServerStream),
  R.map(e => F.pipe(e, renderMouse, IOE.map(mouseServerClientLoop))),
  R.chain(pushToServer),
  // !!!! START the IO<Either>:
  R.map(ioe => ioe())
);
