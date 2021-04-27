import DiffMatchPatch, { patch_obj } from 'diff-match-patch';
import {
  either as E,
  function as F,
  io as IO,
  ioEither as IOE,
  option as O,
  reader as R,
} from 'fp-ts';
import type { ObservableEither } from 'fp-ts-rxjs/es6/ObservableEither';
import { map as mapOE } from 'fp-ts-rxjs/es6/ObservableEither';
import * as RO from 'fp-ts-rxjs/es6/ReaderObservable';
import type ROE from 'fp-ts-rxjs/es6/ReaderObservableEither';
import type { Observable } from 'rxjs';
import { scan } from 'rxjs/operators';
import type { WebSocketSubject } from 'rxjs/webSocket';
import type { Environment } from './index';
import { updatePage } from './updatePage'
import { DiffMessage, SimpleError, DOMpatched } from './codecs';

const parser = new DOMParser();

// type ToDiffvents =  R.Reader<Environment, Observable<DiffMessage>>
const toDiffEvents: RO.ReaderObservable<Environment, DiffMessage> = F.pipe(
    R.asks<Environment, Observable<unknown>>(env => env.ws),
    RO.map(a => DiffMessage.decode(a)),
    RO.filterMap(O.fromEither)
  )

const cleanScripts = (doc: Document): IO.IO<Document> => () => {
  Array.from(doc.getElementsByTagName('link')).filter(elem => elem.getAttribute('as') === 'script').forEach(elem => {
    elem.setAttribute('href', '');
    elem.setAttribute('rel', 'nofollow');
  });
  Array.from(doc.getElementsByTagName('script')).forEach(scriptElem => {
    scriptElem.innerHTML = '';
    scriptElem.setAttribute('src', '');
  });
  return doc;
}

const parseFromString = (s: string): IO.IO<Document> => () => parser.parseFromString(s, 'text/html');

export const parseToDOM = (contents: string): IOE.IOEither<{message: string}, Document> => IOE.tryCatch(
  F.pipe(contents, parseFromString, IO.chain(e => cleanScripts(e))),
  () => ({ message: 'Could not parse page contents' })
)

// export function parseToDOM(contents: string) {
//   return IOE.tryCatch(parser.parseFromString(contents, 'text/html'));
// }

const diffEngine = new DiffMatchPatch.diff_match_patch();

function patchString(domb: string, patches: Array<patch_obj>): E.Either<{message: string}, string> {
  const [patched, results] = diffEngine.patch_apply(patches, domb);
  if (results.indexOf(false) > -1) {
    return E.left({message: 'Could not patch'})
  } else {
    return E.right(patched);
  }
}

const startDOMEither = (startDOM: string): E.Either<{message: string}, string> => {
  if(startDOM.length) {
    return E.right(startDOM);
  } else {
    return E.left({message: 'invalid startDOM'});
  }
}

const renderUpdates = (diffStream: Observable<DiffMessage>): ROE.ReaderObservableEither<Environment, {message: string}, string> => F.pipe(
  R.asks<Environment, string>(e => e.connection.DOMString),
  R.map(startingDOM => 
    F.pipe(
      diffStream,
      scan((domEither, diffs) => {
        return F.pipe(
          domEither,
          E.chain((d) => patchString(d, diffs.payload)),
        );
      }, startDOMEither(startingDOM)),
    ),
  )
)


const notifyServer = (results: ObservableEither<{message: string}, IOE.IOEither<SimpleError, DOMpatched>>): ROE.ReaderObservableEither<Environment, {message: string}, IO.IO<void>> => F.pipe(
  R.asks<Environment, WebSocketSubject<unknown>>(env => env.ws),
  R.map(ws => F.pipe(
    results,
    (r) => {
      r.subscribe((e) =>
        F.pipe(
          e,
          E.map((s) => {
           F.pipe(s, IOE.match(
              z => ws.next({ type: 'error', payload: z}),
              t => ws.next(t)
            ))()
          }),
          E.mapLeft((e) => {
            ws.next({ type: 'error', payload: e });
          }),
        ),
      );
      return r;
    }
  ))
)

export const domDiffFlow: ROE.ReaderObservableEither<Environment, {message: string}, IO.IO<void>> = F.pipe(
  toDiffEvents,
  R.chain(renderUpdates),
  R.map(e => F.pipe(e, mapOE(updatePage))),
  R.chain(e => notifyServer(e))
)
