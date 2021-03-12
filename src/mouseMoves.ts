import {
  function as F,
  taskEither as TE,
  either as E,
  option as O,
  io as IO,
  ioEither as IOE,
  reader as R,
} from 'fp-ts';
import axios, { AxiosResponse } from 'axios';
import * as IOT from 'io-ts';
import { UUID } from 'io-ts-types';
import * as D from 'io-ts/Decoder'
import DiffMatchPatch, { patch_obj } from 'diff-match-patch';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';
import { fromEvent, interval, of } from 'rxjs';
import { startWith, pairwise, map as rMap, withLatestFrom, scan, windowWhen, take, mergeAll, throttle } from 'rxjs/operators';
import type { Observable } from 'rxjs';
import type { ObservableEither } from 'fp-ts-rxjs/es6/ObservableEither';
import { filterMap, map as mapO } from 'fp-ts-rxjs/es6/Observable';
import { map as mapOE, chain as chainOE } from 'fp-ts-rxjs/es6/ObservableEither';
import nanohtml from 'nanohtml';
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

type LocalMouseMoves = R.Reader<Environment, Observable<MouseMoved>>
const localMouseMoves: LocalMouseMoves = R.asks((env) =>
  F.pipe(
    env.iframeMessages,
    rMap((e) => e.data),
    toMouseEvents,
  ),
);

type MouseServerStream = (localenv: {localMouse: Observable<MouseMoved>}) => R.Reader<Environment, Observable<MouseMoved>>
const mouseServerStream: MouseServerStream = (localenv) => R.asks((env) =>
  F.pipe(env.ws, toMouseEvents))
// , remoteMouse: Observable<MouseMoved>

type MouseStreams = {localMouse: Observable<MouseMoved>, remoteMouse: Observable<MouseMoved>}
type MouseServerClientLoop = (localenv: MouseStreams) => Observable<MouseMoved>
const mouseServerClientLoop: MouseServerClientLoop = (localenv) => F.pipe(
  localenv.localMouse,
  windowWhen(() => localenv.remoteMouse),
  rMap(win => win.pipe(take(1))),
  mergeAll()
)

const moveMouse = (mouse: HTMLElement | null) => (position: {x: number, y: number}) => F.pipe(
  mouse,
  E.fromNullable(mouse),
  E.map(m => {
    m.style.left = `${position.x}px`;
    m.style.top = `${position.y}px`;
  })
)

const renderMice = (localenv: MouseStreams): MouseStreams => {
  const pointerLocal = document.getElementById('pointer-local');
  const pointerRemote = document.getElementById('pointer-remote');
  localenv.localMouse.subscribe(e => moveMouse(pointerLocal)(e.payload))
  localenv.remoteMouse.subscribe(e => moveMouse(pointerRemote)(e.payload))
  return localenv;
}

type PushToServer = (throttledMouseEvents: Observable<MouseMoved>) => R.Reader<Environment, Observable<MouseMoved>>
const pushToServer: PushToServer = (throttledMouseEvents) => R.asks((env) => {
  throttledMouseEvents.subscribe(e => {
    env.ws.next({ type: 'mousemove', x: e.payload.x, y: e.payload.y });
  });
  return throttledMouseEvents;
})

export const mouseMovementsFlow = F.pipe(
  R.bindTo('localMouse')(localMouseMoves),
  R.bind('remoteMouse', mouseServerStream),
  R.map(renderMice),
  R.map(mouseServerClientLoop),
  R.chain(pushToServer),
);
