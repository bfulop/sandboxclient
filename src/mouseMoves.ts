import {
  function as F,
  io as IO,
  ioEither as IOE,
  option as O,
  reader as R,
} from 'fp-ts';
import * as E from 'fp-ts/es6/Either';
import { filterMap, map as mapO } from 'fp-ts-rxjs/es6/Observable';
import type * as RO from 'fp-ts-rxjs/es6/ReaderObservable';
import { fromEvent } from 'rxjs';
import type { Observable } from 'rxjs';
import { map as rMap, mergeAll, take, throttleTime, windowWhen } from 'rxjs/operators';
import type { WebSocketSubject } from 'rxjs/webSocket';
import type { Environment } from './index';
import { MouseAction } from './codecs';

const toMouseEvents = (stream: Observable<unknown>): Observable<MouseAction> => 
  F.pipe(
  stream,
  mapO(a => MouseAction.decode(a)),
  filterMap(O.fromEither)
)

const localMouseMoves: IO.IO<Observable<MouseAction>> = () =>
  F.pipe(
    fromEvent<MouseEvent>(window, 'mousemove').pipe(throttleTime(41)),
    rMap((e):MouseAction => ({ type: 'mousemoved', payload: { x: e.clientX, y: e.clientY } })),
  );

const mouseServerStream: RO.ReaderObservable<Environment, MouseAction> = F.pipe(
  R.asks<Environment, WebSocketSubject<unknown>>(env => env.ws),
  R.map(toMouseEvents)
)

type MouseStreams = {localMouse: Observable<MouseAction>, remoteMouse: Observable<MouseAction>}

const mouseServerClientLoop = (localenv: MouseStreams): Observable<MouseAction> => F.pipe(
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

const pushToServer = (throttledMouseEvents: IOE.IOEither< { message: string }, Observable<MouseAction>>) =>
  F.pipe(
    R.asks<Environment, WebSocketSubject<unknown>>((env: Environment) => env.ws),
    R.map((ws) =>
      F.pipe(
        throttledMouseEvents,
        IOE.map((s) => {
          s.subscribe((e) => {
            ws.next(MouseAction.encode({ type: 'mousemoved', payload: {x: e.payload.x, y: e.payload.y }}));
          });
          return s;
        }),
      ),
    ),
  );

export const mouseMovementsFlow = F.pipe(
  R.bindTo('remoteMouse')(mouseServerStream),
  R.bind('localMouse', () => localMouseMoves),
  R.map(e => F.pipe(e, renderMouse, IOE.map(b => mouseServerClientLoop(b)))),
  R.chain(pushToServer),
  // !!!! START the IO<Either>:
  R.map(ioe => ioe())
);
