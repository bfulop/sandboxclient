import {
  function as F,
  taskEither as TE,
  either as E,
  option as O,
  io as IO,
  ioEither as IOE,
  reader as R,
  readerEither as RE,
  readerTaskEither as RTE,
  task as T,
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
import * as ROE from 'fp-ts-rxjs/es6/ReaderObservableEither';
import { filterMap, map as mapO } from 'fp-ts-rxjs/es6/Observable';
import { map as mapOE, chain as chainOE } from 'fp-ts-rxjs/es6/ObservableEither';
import { domDiffFlow } from './domDiffs';
import { mouseMovementsFlow } from './mouseMoves';
import { mouseClicksFlow } from './mouseclicks';

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

const getPage = (targetUrl: string) => F.pipe(
  targetUrl,
  httpGet,
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
): TE.TaskEither<Error, HTMLIFrameElement> =>
  TE.tryCatch(
    (): Promise<HTMLIFrameElement> => {
      return new Promise((res, rej) => {
        iframe.srcdoc = contents;
        window.requestAnimationFrame(() => {
          // console.log(iframe.contentDocument);
          // TODO: need to resolve this
          // need to add this timeout so that we proprely
          // render into the iframe contentDocument
          // in the domDiffs
          window.requestAnimationFrame(() => {
            setTimeout(() => res(iframe), 10);
          });
        });
      });
    },
    (reason) => new Error(String(reason)),
  );

const insertIframe = (domString: string) =>
  F.pipe(
    getIframeElement(),
    TE.fromIO,
    TE.chain(addIframeContents(domString)),
  );

const serverSocket = (payload: LoadedPage): IO.IO<WebSocketSubject<unknown>> => () => {
  const subject = webSocket(`ws://localhost:8088/${payload.id}`);
  // subject.subscribe(
  //   (msg) => { console.log('message', msg) },
  //   (err) => console.log(err), // Called if at any point WebSocket API signals some kind of error.
  //   () => console.log('subject complete'), // Called when connection is closed (for whatever reason).
  // );
  subject.next({ message: { type: 'listeningToDOMDiffs' } })
  return subject;
}
const iframeMessages = () => fromEvent<MessageEvent>(window, 'message');

const insertBridge = (htmlstring: string) => {
  return htmlstring.replace('</body>', `
    <script>
    let timer = null;
    function resetTimer() {
      timer = null;
    }
    document.addEventListener('mousemove', (e) => {
    if (timer === null) {
        timer = setTimeout(resetTimer, 41);
window.top.postMessage({ type: 'mousemoved', payload: { x: e.clientX, y: e.clientY }});
    }
    })
    </script>
    </body>`)
}

export interface Environment {
  connection: LoadedPage,
  iframe: HTMLIFrameElement,
  ws: WebSocketSubject<unknown>,
  iframeMessages: Observable<MessageEvent<unknown>>,
  clicks: Observable<MouseEvent>
}

const envSetup = (pageUrl: string) : TE.TaskEither<Error, Environment> =>
  F.pipe(
    TE.bindTo('connection')(getPage(pageUrl)),
    TE.bind('iframe', ({ connection }) => F.pipe(connection.DOMString, insertBridge, insertIframe)),
    TE.bind('ws', ({ connection }) => TE.fromIO(serverSocket(connection))),
    TE.bind('iframeMessages', () => TE.fromIO(iframeMessages)),
    TE.bind('clicks', () => TE.fromIO(() => fromEvent<MouseEvent>(document, 'click')))
  );

// TODO : envTearDown

const program = F.pipe(
  domDiffFlow,
  R.chain(() => mouseMovementsFlow),
  R.chain(() => mouseClicksFlow),
)

const mainApp = (pageUrl: string) => F.pipe(
  pageUrl,
  envSetup,
  TE.map(program)
)

// launch the program
F.pipe(
  '/api/getpage?pageurl=http%3A//sandboxedtests.vercel.app/clickcounter',
  mainApp,
  T.map(
    E.fold(
      console.error,
      console.log
    )
  ),
  invokeTask => invokeTask()
)
