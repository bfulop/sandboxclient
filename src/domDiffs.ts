import {
  function as F,
  taskEither as TE,
  either as E,
  option as O,
  io as IO,
  ioEither as IOE,
  reader as R,
  readerEither as RE,
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

const parser = new DOMParser();

const isPatch_Obj = (input: unknown): input is patch_obj => {
  if (
    input &&
    typeof input === 'object' &&
    input.hasOwnProperty('diffs') &&
    input.hasOwnProperty('start1') &&
    input.hasOwnProperty('start2') &&
    input.hasOwnProperty('length1') &&
    input.hasOwnProperty('length2')
  ) {
    return true;
  }
  return false;
};


const patchDecode: D.Decoder<unknown, patch_obj> = {
  decode: u => isPatch_Obj(u) ? D.success(u) : D.failure(u, 'patchobj')
}

const DiffPatchArray: D.Decoder<unknown, Array<patch_obj>> = D.array(patchDecode);

export const DiffMessage = D.type({
  type: D.literal('diff'),
  payload: DiffPatchArray
})

export type DiffMessage = D.TypeOf<typeof DiffMessage>

type ToDiffvents =  R.Reader<Environment, Observable<DiffMessage>>
const toDiffEvents: ToDiffvents =  R.asks((env) =>
  F.pipe(
    env,
    () => env.ws,
    mapO(a => DiffMessage.decode(a)),
    filterMap(O.fromEither),
  )
)


export function parseToDOM(contents: string) {
  return parser.parseFromString(contents, 'text/html');
}
const diffEngine = new DiffMatchPatch.diff_match_patch();

function patchString(domb: string, patches: Array<patch_obj>): E.Either<string, string> {
  const [patched, results] = diffEngine.patch_apply(patches, domb);
  if (results.indexOf(false) > -1) {
    return E.left('Could not patch')
  } else {
    return E.right(patched);
  }
}

const startDOMEither = (startDOM: string): E.Either<string, string> => {
  if(startDOM.length) {
    return E.right(startDOM);
  } else {
    return E.left('invalid startDOM');
  }
}

type RenderUpdates = (
  diffStream: Observable<DiffMessage>,
) => R.Reader<Environment, ObservableEither<string, string>>;
const renderUpdates: RenderUpdates = (diffStream: Observable<DiffMessage>) =>
  R.asks((env: Environment) =>
    F.pipe(
      diffStream,
      scan((domEither, diffs) => {
        return F.pipe(
          domEither,
          E.chain((d) => patchString(d, diffs.payload)),
        );
      }, startDOMEither(env.connection.DOMString)),
    ),
  );

type UpdateIframe = (domStrings: ObservableEither<string, string>) => R.Reader<Environment, ObservableEither<string, unknown>>
const updateIframe: UpdateIframe = (domStrings) => R.asks((env) => F.pipe(
  domStrings,
  mapOE(s => morph(env.iframe.contentDocument, parseToDOM(s)))
))

type NotifyServer = (results: ObservableEither<string, unknown>) => R.Reader<Environment, ObservableEither<string, unknown>>
const notifyServer: NotifyServer = (results) => R.asks((env) =>
  F.pipe(results, (r) => {
    r.subscribe((e) =>
      F.pipe(
        e,
        E.map(() => {
          env.ws.next({ type: 'DOMpatched' });
        }),
        E.mapLeft((e) => {
          console.log('err', e);
          env.ws.next({ type: 'error', payload: e });
        }),
      ),
    );
    return r;
  }));

export type DomDiffFlow = R.Reader<Environment, ObservableEither<string, unknown>>
export const domDiffFlow: DomDiffFlow = F.pipe(
  toDiffEvents,
  R.chain(renderUpdates),
  R.chain(updateIframe),
  R.chain(notifyServer)
)
