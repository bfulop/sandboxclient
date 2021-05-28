import {
  either as E,
  function as F,
  io as IO,
  reader as R,
  task as T,
  taskEither as TE,
} from 'fp-ts';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';
import { domDiffFlow } from './domDiffs';
import { mouseClicksFlow } from './mouseclicks';
import { mouseMovementsFlow } from './mouseMoves';
import { windowScroll } from './windowScroll';
import { LoadedPage } from './codecs';
import { updatePage } from './updatePage';
import { formEditFlow } from './formInput';

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
  request: (input) =>
    TE.tryCatch(
      () => {
        return fetch(input, { mode: 'no-cors' })
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
  TE.chainW(toJson),
  TE.chainEitherKW((s) => F.pipe(s, LoadedPage.decode))
);

const serverSocket = (payload: LoadedPage): IO.IO<WebSocketSubject<unknown>> => () => {
  const subject = webSocket(`ws://46.101.30.25:8088/${payload.id}`);
  subject.next({ message: { type: 'listeningToDOMDiffs' } })
  return subject;
}

export interface Environment {
  connection: LoadedPage,
  ws: WebSocketSubject<unknown>,
}

const envSetup = (pageUrl: string) =>
  F.pipe(
    TE.bindTo('connection')(getPage(pageUrl)),
    TE.bindW(
      'ws',
      ({ connection }): TE.TaskEither<never, WebSocketSubject<unknown>> =>
        TE.fromIO<never, WebSocketSubject<unknown>>(serverSocket(connection)),
    ),
    TE.chainFirstW(({ connection }) =>
      F.pipe(connection.DOMString, updatePage, TE.fromIOEither),
    ),
  );
// TODO : envTearDown

const program = F.pipe(
  domDiffFlow,
  R.chain(() => mouseMovementsFlow),
  R.chain(() => mouseClicksFlow),
  R.chain(() => windowScroll),
  R.chain(() => formEditFlow),
)

const loadPageMain = (pageUrl: string) => F.pipe(
  pageUrl,
  envSetup,
  TE.map(program)
)

function updateRequestRedirect(url: string): void {
  // communicate with the Service Worker proxy
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'remoteUrl',
      payload: url,
      currenturl: document.location.origin,
    });
  }
}

// load and start using a page
export const loadPage = (pageUrl: string): Promise<void> =>
  F.pipe(
    pageUrl,
    e => {
      updateRequestRedirect(e);
      return e;
    },
    e => `/api/getpage/?window[width]=${window.innerWidth}&window[height]=${window.innerHeight}&url=${encodeURIComponent(e)}`,
    loadPageMain,
    T.map(E.fold(console.error, console.log)),
    invokeTask => invokeTask(),
  );
