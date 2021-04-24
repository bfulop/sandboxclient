import {
  either as E,
  function as F,
  io as IO,
  option as O,
  reader as R,
  task as T,
  taskEither as TE,
} from 'fp-ts';
import type { Observable } from 'rxjs';
import { fromEvent } from 'rxjs';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';
import { domDiffFlow } from './domDiffs';
import { mouseClicksFlow } from './mouseclicks';
import { mouseMovementsFlow } from './mouseMoves';
import { LoadedPage } from './codecs';

// Error types
type HttpRequestError = {
  tag: 'httpRequestError'
  error: unknown
}

type HttpContentTypeError = {
  tag: 'httpContentTypeError'
  error: unknown
}

// Interface
interface HttpClient {
  request(
    input: RequestInfo,
    init?: RequestInit,
  ): TE.TaskEither<HttpRequestError, Response>
}

const fetchHttpClient: HttpClient = {
  request: (input, init) =>
    TE.tryCatch(
      () => {
        return fetch(input, init)
      },
      (e: unknown) => ({
        tag: 'httpRequestError',
        error: e,
      }),
    ),
}

const toJson = (
  response: Response,
): TE.TaskEither<HttpContentTypeError, unknown> =>
  TE.tryCatch(
    () => response.json(),
    (e: unknown) => ({ tag: 'httpContentTypeError', error: e }),
  )

const getPage = (targetUrl: string) => F.pipe(
  targetUrl,
  fetchHttpClient.request,
  TE.map(e => {
    console.log('what is the response?', e);
    return e;
  }),
  TE.chainW(toJson),
  TE.chainEitherKW((s) => F.pipe(s, LoadedPage.decode))
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
      return new Promise((res) => {
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

const envSetup = (pageUrl: string) =>
  F.pipe(
    TE.bindTo('connection')(getPage(pageUrl)),
    TE.bindW('iframe', ({ connection }) => F.pipe(connection.DOMString, insertBridge, insertIframe)),
    TE.bindW('ws', ({ connection }): TE.TaskEither<never, WebSocketSubject<unknown>> => TE.fromIO<never, WebSocketSubject<unknown>>(serverSocket(connection))),
    TE.bindW('iframeMessages', (): TE.TaskEither<never, Observable<MessageEvent>> => TE.fromIO(iframeMessages)),
    TE.bindW('clicks', ():TE.TaskEither<never, Observable<MouseEvent>> => TE.fromIO(() => fromEvent<MouseEvent>(document, 'click')))
  );

// TODO : envTearDown

const program = F.pipe(
  domDiffFlow,
  R.chain(() => mouseMovementsFlow),
  R.chain(() => mouseClicksFlow),
)

const loadPageMain = (pageUrl: string) => F.pipe(
  pageUrl,
  envSetup,
  TE.map(program)
)

// load and start using a page
export const loadPage = (pageUrl: string): Promise<void> => F.pipe(
  // '/api/getpage?pageurl=http%3A//sandboxedtests.vercel.app/clickcounter',
  pageUrl,
  e => `/api/getpage/${encodeURIComponent(e)}`,
  loadPageMain,
  T.map(
    E.fold(
      console.error,
      console.log
    )
  ),
  invokeTask => invokeTask()
)
