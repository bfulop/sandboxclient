import * as t from 'io-ts';
import { UUID } from 'io-ts-types';
import type { patch_obj } from 'diff-match-patch';

// ****************  SIMPLE TYPES  ****************  

export type SimpleError = {
  message: string
}

// ****************  USER EVENTS  ****************  

const isPatch_Obj = (input: unknown): input is patch_obj => {
  if (
    input &&
    typeof input === 'object' &&
    'diffs' in input &&
    'start1' in input &&
    'start2' in input &&
    'length1' in input &&
    'length2' in input
  ) {
    return true;
  }
  return false;
};

const patchObj = new t.Type<patch_obj, Record<string, unknown>, unknown>(
  'patchObj',
  (input: unknown): input is patch_obj => isPatch_Obj(input),
  (input, context) => isPatch_Obj(input) ? t.success(input) : t.failure(input, context),
  (input: patch_obj) => {
    return {
      diffs: input.diffs,
      start1: input.start1,
      start2: input.start2,
      length1: input.length1,
      length2: input.length2,
    }
  }
)

const DiffMessage = t.type({
  type: t.literal('diff'),
  payload: t.array(patchObj),
});

type DiffMessage = t.TypeOf<typeof DiffMessage>

const MouseEventTypes = t.keyof({
  mousemoved: null,
  mouseclick: null,
  windowscroll: null,
})

const ActionCoords = t.type({
  x: t.number,
  y: t.number
})

const MouseAction = t.type({
  type: MouseEventTypes,
  payload: ActionCoords
});

type MouseAction = t.TypeOf<typeof MouseAction>

const FormAction = t.type({
  type: t.literal('formaction'),
  payload: t.type({
    tagname: t.string,
    index: t.number,
    value: t.string
  })
})

type FormAction = t.TypeOf<typeof FormAction>

const UserEvent = t.union([MouseAction, FormAction]);
type UserEvent = t.TypeOf<typeof UserEvent>

const LoadedPage = t.type({
  id: UUID,
  DOMString: t.string,
});

type LoadedPage = t.TypeOf<typeof LoadedPage>;

export { DiffMessage, LoadedPage, MouseAction, FormAction, UserEvent };

// ****************  SYSTEM EVENTS  ****************  

const DOMpatched = t.type({
  type: t.literal('DOMpatched')
})

const ListeningToDOMDiffs = t.type({
  type: t.literal('listeningToDOMDiffs')
})

type DOMpatched = t.TypeOf<typeof DOMpatched>;
type ListeningToDOMDiffs = t.TypeOf<typeof ListeningToDOMDiffs>;

const SystemEvents = t.union([DOMpatched, ListeningToDOMDiffs]);
type SystemEvents = t.TypeOf<typeof SystemEvents>;

export { DOMpatched, ListeningToDOMDiffs, SystemEvents };

// ****************  SOCKET EVENTS  ****************  

const WebSocketMessage = t.type({
  type: t.literal('message'),
  data: t.string
});

const KnownEvent = t.union([SystemEvents, UserEvent]);
type KnownEvent = t.TypeOf<typeof KnownEvent>

export { WebSocketMessage, KnownEvent };
