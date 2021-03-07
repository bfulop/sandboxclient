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
import { filterMap, map as mapO } from 'fp-ts-rxjs/es6/Observable';
import { map as mapOE, chain as chainOE } from 'fp-ts-rxjs/es6/ObservableEither';
import morph from 'nanomorph';
import nanohtml from 'nanohtml';
import { domDiffFlow } from './domDiffs';
import { mouseMovementsFlow } from './mouseMoves';

// const HandledMessages = D.union(DiffMessage, MouseMoved);
// type HandledMessages = D.TypeOf<typeof HandledMessages>

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
): IOE.IOEither<Error, HTMLIFrameElement> =>
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
  iframeMessages: Observable<MessageEvent<unknown>>
}

const envSetup : TE.TaskEither<Error, Environment> =
  F.pipe(
    TE.bindTo('connection')(getPage),
    TE.bind('iframe', ({ connection }) => F.pipe(connection.DOMString, insertBridge, insertIframe)),
    TE.bind('ws', ({ connection }) => TE.fromIO(serverSocket(connection))),
    TE.bind('iframeMessages', () => TE.fromIO(iframeMessages))
  );

//
// type DoReader = (s: string) => R.Reader<Environment, string>
// const doReader: DoReader = (s: string) => R.asks(e => (s + e.connection.id))
//
// type Myread =  R.Reader<Environment, string>
// const myread: Myread =  R.asks(e => (e.connection.DOMString.toUpperCase()))
//
//
// type LocalMouseMock =  R.Reader<Environment, Observable<number>>
// const localMouseMock: LocalMouseMock = R.asks(env => {
//   return of(3);
// });
//
// type RemoteMouseMock = (s: Observable<number>) => R.Reader<Environment, Observable<string>>
// const remoteMouseMock: RemoteMouseMock = (s) => R.asks(env => {
//   return of('remote')
// })
//
// type RemoteMouseDo = (s: {localMouse: Observable<number>}) => R.Reader<Environment, Observable<string>>
// const remoteMouseDo: RemoteMouseDo = (s) => R.asks(env => {
//   return of('remote')
// })
//
// type MouseProgram =  R.Reader<Environment, Observable<string>>
// const mouseProgram: MouseProgram = F.pipe(
//   localMouseMock,
//   R.chain(e => remoteMouseMock(e))
// )
//
// const mouseAsDo = F.pipe(
//   R.bindTo('localMouse')(localMouseMock),
//   R.bind('remoteMouse', remoteMouseDo)
// )

type Readerflow = R.Reader<Environment, Observable<string>>
const program = F.pipe(
  domDiffFlow,
  R.chain(() => mouseMovementsFlow)
)

const mainApp = F.pipe(
  envSetup,
  TE.map(program)
)

// launch the program
F.pipe(
  mainApp,
  T.map(
    E.fold(
      console.error,
      console.log
    )
  ),
  invokeTask => invokeTask()
)
