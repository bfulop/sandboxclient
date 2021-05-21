import {
	function as F,
	io as IO,
	reader as R,
	either as E,
	option as O,
	apply as App
} from 'fp-ts';
import { fromEvent } from 'rxjs';
import { WebSocketSubject } from 'rxjs/webSocket';
import { map as mapO } from 'fp-ts-rxjs/es6/Observable';
import type { ObservableEither } from 'fp-ts-rxjs/es6/ObservableEither';
import { Environment } from './index';
import { FormAction } from './codecs';
import { debounceTime } from 'rxjs/operators';

const inputElements = document.getElementsByTagName('input');

function getElementIndex(e: HTMLInputElement): E.Either<{ message: string }, number> {
	let found = false;
	let index = -1;
	while (!found && index < inputElements.length) {
		index = index + 1;
		if (e === inputElements[index]) {
			found = true;
		}
	}
	if (found) {
		return E.right(index);
	}
	return E.left({ message: 'input element not found' })
}

function createFormAction(e: InputEvent): E.Either<{ message: string }, FormAction> {
	return App.sequenceS(E.Apply)({
		type: E.right<{ message: string }, 'formaction'>("formaction"),
		payload: App.sequenceS(E.Apply)({
			index: F.pipe(e, v => v.target as HTMLInputElement, O.fromNullable, E.fromOption(() => ({ message: 'notarget' })), E.chain(getElementIndex)),
			value: F.pipe(e, v => v.target as HTMLInputElement, O.fromNullable, E.fromOption(() => ({ message: 'notarget' })), E.map(target => target.value)),
			tagname: E.right('input')
		})
	})
}

function getFormChangeEvents(): ObservableEither<{ message: string }, FormAction> {
	return F.pipe(
		fromEvent<InputEvent>(window, 'input')
			.pipe(
				debounceTime(1000),
				mapO((e) => createFormAction(e))
			))
}

function pipeToServer(inputActions: ObservableEither<{ message: string }, FormAction>): (ws: WebSocketSubject<unknown>) => void {
	return (ws) => {
		inputActions.subscribe((e) => {
			F.pipe(
				e,
				E.map(action => FormAction.encode(action)),
				E.map(action => { 
					console.log(action)
					ws.next(action)
					return action;
				})
			)
		})
	}
}

export const formEditFlow = F.pipe(
	R.asks<Environment, IO.IO<WebSocketSubject<unknown>>>(env => IO.of(env.ws)),
	R.map(w => F.pipe(IO.of(pipeToServer), IO.ap(getFormChangeEvents), IO.ap(w))),
	// !!!! START the IO:
	R.map(io => io())
)