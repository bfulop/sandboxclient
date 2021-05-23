import {
  either as E,
  function as F,
  ioEither as IOE,
  option as O,
  io as IO,
} from 'fp-ts';
import * as OB from 'fp-ts-rxjs/es6/Observable';
import type { Observable } from 'rxjs';
import type { ObservableEither } from 'fp-ts-rxjs/es6/ObservableEither';
import { fromEvent } from 'rxjs';
import { take as take$, tap, withLatestFrom, map as map$ } from 'rxjs/operators';
import { loadPage } from './index';

fetch('/api/hello?name=reader').then(res => {
  console.log(res);
})

const urlRegex = new RegExp(/(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/m)

const getURLInputElem: IOE.IOEither<{ message: string }, HTMLInputElement> = () => F.pipe(
  document.getElementById('gotourl'),
  E.fromNullable({ message: 'goto url input not found' }),
  E.chain(e => {
    if (e instanceof HTMLInputElement) {
      return E.right(e);
    } else {
      return E.left({ message: 'url input element is not an input' })
    }
  })
)

const getGotoButtonElement: IOE.IOEither<{ message: string }, HTMLButtonElement> = () => F.pipe(
  document.getElementById('gotourlbutton'),
  E.fromNullable({ message: 'goto url failed' }),
  E.chain(e => {
    if (e instanceof HTMLButtonElement) {
      return E.right(e);
    } else {
      return E.left({ message: 'goto button is not a button' })
    }
  })
)

type validURL = string;


const urlInputs = (
  urlInputElem: HTMLInputElement,
): IO.IO<ObservableEither<{ message: string }, validURL>> => () =>

    F.pipe(
      urlInputElem,
      e => fromEvent<InputEvent>(e, 'input'),
      r =>
        F.pipe(
          r,
          OB.map(
            (e): E.Either<{ message: string }, string> => {
              if (e.target !== null && e.target instanceof HTMLInputElement) {
                return E.right(e.target.value);
              } else {
                return E.left({ message: 'no event target' });
              }
            },
          ),
          OB.map(e =>
            F.pipe(
              e,
              E.map(b => {
                if (b.startsWith('http')) {
                  return b;
                }
                return `https://${b}`;
              }),
              E.chain(
                E.fromPredicate(
                  e => urlRegex.test(e),
                  () => ({ message: 'not a valid url' }),
                ),
              ),
            ),
          ),
        ),
    );

const buttonClicksObsIO = (button: HTMLButtonElement): IO.IO<Observable<Event>> => () => fromEvent(button, 'click');
// when the url is _Right, let the 'clicks' through

const handleUrlInputs = F.pipe(
  IOE.bindTo('urlInputElem')(getURLInputElem),
  IOE.bind('buttonElement', () => getGotoButtonElement),
  IOE.bind('gotoURLPresses', ({ buttonElement }) =>
    F.pipe(buttonElement, buttonClicksObsIO, IOE.fromIO),
  ),
  IOE.bind('urlInputStream', ({ urlInputElem }) =>
    F.pipe(urlInputElem, urlInputs, IOE.fromIO),
  ),
  IOE.map(({ urlInputStream, gotoURLPresses, urlInputElem, buttonElement }) =>
    F.pipe(
      urlInputStream,
      tap(
        F.pipe(
          E.fold(
            () => {
              [urlInputElem, buttonElement].forEach(e => {
                e.classList.remove('valid');
                e.classList.add('invalid');
              });
            },
            () => {
              [urlInputElem, buttonElement].forEach(e => {
                e.classList.remove('invalid');
                e.classList.add('valid');
              });
            },
          ),
        ),
      ),
      // TODO here update the CSS stuff of the button and urlinput
      OB.filterMap(O.fromEither),
      e => gotoURLPresses.pipe(withLatestFrom(e), take$(1)),
    ),
  ),
);

const mainApp = F.pipe(
  handleUrlInputs,
  IOE.fold(
    e => () => {
      console.log('did not work', e)
    },
    r => () => {
      r.pipe(take$(1), 
        map$(
          ([, url]) => {
            console.log('should go to url', url);
          })),
        r.subscribe(([, url]) => {
          loadPage(url)
            // TODO clean this up
            .then(() => {
              const urlform = document.getElementById('gotoform');
              if (urlform) {
                urlform.style.setProperty('display', 'none', 'important')
              }
            })
        })
    }
  )
)

mainApp()
