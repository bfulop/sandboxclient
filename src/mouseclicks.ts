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
import morph from 'nanomorph';
import nanohtml from 'nanohtml';
import type { Environment } from './index';

const MouseClicked = D.type({
  type: D.literal('mouseclick'),
  payload: D.type({
    x: D.number,
    y: D.number,
  })
});

type MouseClicked = D.TypeOf<typeof MouseClicked>

const toMouseClicks = (stream: Observable<unknown>): Observable<MouseClicked> => 
  F.pipe(
  stream,
  mapO(a => MouseClicked.decode(a)),
  filterMap(O.fromEither)
)

type LocalMouseClicks = R.Reader<Environment, Observable<MouseEvent>>
const localMouseClicks: LocalMouseClicks = R.asks((env) =>
  F.pipe(
    env.clicks,
  ),
);


type PushToServer = (throttledMouseEvents: Observable<MouseEvent>) => R.Reader<Environment, Observable<Event>>
const pushToServer: PushToServer = (throttledMouseEvents) => R.asks((env) => {
  throttledMouseEvents.subscribe(e => {
    env.ws.next({ type: 'mouseclick', x: e.clientX, y: e.clientY - 60 });
  });
  return throttledMouseEvents;
})

export const mouseClicksFlow = F.pipe(
  localMouseClicks,
  R.chain(pushToServer),
);
