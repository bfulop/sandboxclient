import {
  either as E,
  function as F,
  ioEither as IOE,
  option as O,
} from 'fp-ts';
import * as OB from 'fp-ts-rxjs/es6/Observable';
import type { ObservableEither } from 'fp-ts-rxjs/es6/ObservableEither';
import { fromEvent } from 'rxjs';
import { take as take$, tap, withLatestFrom, map as map$ } from 'rxjs/operators';
// import { loadPage } from './index';

const urlRegex = new RegExp('^(https?|ftp)://[^\s/$.?#].[^\s]*$', 'is');

const getURLInputElem: IOE.IOEither<{message: string}, HTMLInputElement> = () => F.pipe(
  document.getElementById('gotourl'),
  E.fromNullable({message: 'goto url input not found'}),
  E.chain(e => {
    if (e instanceof HTMLInputElement) {
      return E.right(e);
    } else {
      return E.left({message: 'url input element is not an input'})
    }
  })
)

const getGotoButtonElement: IOE.IOEither<{message: string}, HTMLButtonElement> = () => F.pipe(
  document.getElementById('gotourlbutton'),
  E.fromNullable({message: 'goto url button not found'}),
  E.chain(e => {
    if (e instanceof HTMLButtonElement) {
      return E.right(e);
    } else {
      return E.left({message: 'goto button is not a button'})
    }
  })
)

type validURL = string;


// type into url
// value stream
// validated value stream
// merge with click or enter


const urlInputs = (urlInputElem: HTMLInputElement): ObservableEither<{message: string}, validURL> => F.pipe(
  urlInputElem,
  e => fromEvent<InputEvent>(e, 'input'),
  r => F.pipe(
    r,
    OB.map((e):E.Either<{message: string}, string> => {
      if (e.target !== null && e.target instanceof HTMLInputElement) {
        return E.right(e.target.value)
      } else {
        return E.left({message: 'no event target'})
      }
    }),
    OB.map(e => F.pipe(e,
      E.map(b => {
      if(b.startsWith('http')) { return b };
      return `https://${b}` }),
      E.chain((b):E.Either<{message: string}, validURL> => {
        // TODO fromPredicate
        // O.chain(O.fromPredicate(s => urlRegex.test(s)))
        if(urlRegex.test(b)) {
          console.log('yes valid url')
          return E.right(b)
        }
        return E.left({message: 'not a valid url'})
      })
    )),
  )
);

// when the url is _Right, let the 'clicks' through
const handleUrlInputs = F.pipe(
  IOE.bindTo('urlInputElem')(getURLInputElem),
  IOE.bind('buttonElement', ():IOE.IOEither<{message: string}, HTMLButtonElement> => getGotoButtonElement),
  IOE.bind('gotoURLPresses', ({ buttonElement }) => IOE.fromIO(() => fromEvent(buttonElement, 'click'))),
  IOE.bind('urlInputStream', ({ urlInputElem }) => IOE.fromIO(() => urlInputs(urlInputElem))),
  IOE.map(({ urlInputStream, gotoURLPresses, urlInputElem, buttonElement }) => F.pipe(
    urlInputStream,
    tap(F.pipe(E.fold(
        () => {[urlInputElem, buttonElement].forEach(e => {console.log('ha, invalid', e);e.classList.remove('valid');e.classList.add('invalid');})},
        () => {[urlInputElem, buttonElement].forEach(e => {console.log('ha, valid', e);e.classList.remove('invalid');e.classList.add('valid');})},
      ))
    ),
    // TODO here update the CSS stuff of the button and urlinput
    OB.filterMap(O.fromEither),
    (e) => gotoURLPresses.pipe(withLatestFrom(e), take$(1))
  ))
)

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
        // loadPage(url);
        console.log('should go to url', url);
      })),
      r.subscribe(e => {
        console.log('valid url streams', e)
      })
      console.log('did work!', r)
    }
  )
)

mainApp()
