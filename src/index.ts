import {
  function as F,
  taskEither as TE,
  either as E,
  option as O,
  io as IO,
  ioEither as IOE,
} from 'fp-ts';
import axios, { AxiosResponse } from 'axios';
import * as IOT from 'io-ts';
import { UUID } from 'io-ts-types';
import * as D from 'io-ts/Decoder'
import DiffMatchPatch, { patch_obj } from 'diff-match-patch';
import { webSocket } from 'rxjs/webSocket';
import { of } from 'rxjs';
import { startWith, pairwise, map as rMap, withLatestFrom, scan } from 'rxjs/operators';
import type { Observable } from 'rxjs';
import type { ObservableEither } from 'fp-ts-rxjs/es6/ObservableEither';
import { filterMap, map as mapO } from 'fp-ts-rxjs/es6/Observable';
import { map as mapOE, chain as chainOE } from 'fp-ts-rxjs/es6/ObservableEither';
import morph from 'nanomorph';
import nanohtml from 'nanohtml';

const parser = new DOMParser();

export function parseToDOM(contents: string) {
  return parser.parseFromString(contents, 'text/html');
}
const diffEngine = new DiffMatchPatch.diff_match_patch();

function patchDOM(domb: string, patches: Array<patch_obj>): E.Either<string, string> {
  const [patched, results] = diffEngine.patch_apply(patches, domb);
  if (results.indexOf(false) > -1) {
    return E.left('Could not patch')
  } else {
    return E.right(patched);
  }
}

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

const DiffMessage = D.type({
  type: D.literal('diff'),
  payload: DiffPatchArray
})

type DiffMessage = D.TypeOf<typeof DiffMessage>

const loadedPage = IOT.type({
  id: UUID,
  DOMString: IOT.string,
});

export type LoadedPage = IOT.TypeOf<typeof loadedPage>;

const httpGet = (url: string) =>
  TE.tryCatch<Error, AxiosResponse>(
    () => axios.get(url),
    (reason) => new Error(String(reason)),
  );

const getPage = F.pipe(
  httpGet('/api/getpage?pageurl=http%3A//localhost%3A3000/thirdpage'),
  TE.map((x) => x.data),
  TE.chain((s) =>
    F.pipe(
      loadedPage.decode(s),
      E.mapLeft((err) => new Error(String(err))),
      TE.fromEither,
    ),
  ),
);

const getElement = (id: string): IOE.IOEither<Error, HTMLElement> => () =>
  F.pipe(
    id,
    (i) => O.fromNullable(document.getElementById(i)),
    E.fromOption(() => new Error(String('could not find element'))),
  );

const getIframeElement = (): IO.IO<HTMLIFrameElement> => 
  F.flow(
    () => O.fromNullable(document.getElementsByTagName('iframe')[0]),
    O.getOrElse(() => {
     document.body.insertAdjacentHTML('beforeend', '<iframe id="theiframe"></iframe>');
     return document.getElementsByTagName('iframe')[0];
  })
  );

const addIframeContents = (contents: string) => (
  iframe: HTMLIFrameElement,
): IOE.IOEither<Error, HTMLElement> =>
  IOE.tryCatch(
    () => {
      iframe.srcdoc = contents;
      return iframe;
    },
    (reason) => new Error(String(reason)),
  );

const insertIframe = (domString: string) =>
  F.pipe(
    getIframeElement(),
    IO.chain(addIframeContents(domString)),
    TE.fromIOEither,
  );

const toDiffEvents = (
  stream: Observable<unknown>
): Observable<DiffMessage> =>
  F.pipe(
    stream,
    mapO(a => DiffMessage.decode(a)),
    filterMap(O.fromEither)
  );

const startDOMEither = (startDOM: string): E.Either<string, string> => {
  if(startDOM.length) {
    return E.right(startDOM);
  } else {
    return E.left('invalid startDOM');
  }
}

const renderUpdates = (startDOM: string) => (diffStream: Observable<DiffMessage>) => F.pipe(
  diffStream,
  scan((domEither, diffs) => {
    return F.pipe(
      domEither,
      E.chain(d => patchDOM(d, diffs.payload))
    )
  }, startDOMEither(startDOM))
)

const startSocket = (payload: LoadedPage) => {
  const subject = webSocket(`ws://localhost:8088/${payload.id}`);
  // subject.subscribe(
  //   (msg) => console.dir(msg, {depth: 4}), // Called whenever there is a message from the server.
  //   (err) => console.log(err), // Called if at any point WebSocket API signals some kind of error.
  //   () => console.log('subject complete'), // Called when connection is closed (for whatever reason).
  // );

  const domDiffFlow = F.pipe(
    subject, 
    toDiffEvents,
    renderUpdates(payload.DOMString),
    mapOE(
      (msg) => F.pipe(
          getIframeElement(),
          i => morph(i().contentDocument, parseToDOM(msg))
        )
    )
  );

  domDiffFlow.subscribe(
    (msg) => {
      console.log('render cycle finished', msg);
      F.pipe(
        msg,
        E.map(() => subject.next({ type: 'DOMpatched' }))
      )
    }, // Called whenever there is a message from the server.
    (err) => console.log(err), // Called if at any point WebSocket API signals some kind of error.
    () => console.log('DOMs complete'), // Called when connection is closed (for whatever reason).
  );

  subject.next({message: { type: 'listeningToDOMDiffs' }})
};

const workflow = () =>
  F.pipe(
    TE.bindTo('connection')(getPage),
    TE.bind('iframe', ({ connection }) => insertIframe(connection.DOMString)),
    TE.map(({ connection }) => startSocket(connection)),
    TE.mapLeft(console.error),
  )();

workflow();
