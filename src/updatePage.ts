import { 
  function as F,
  either as E,
  ioEither as IOE,
  io as IO,
  apply as Apply
} from 'fp-ts'
import morph from 'nanomorph';
import { SimpleError, DOMpatched } from './codecs'

const parser = new DOMParser();

// at the highest level
// receive DOM string
// map it to a Document
// map it to [Head, Body, BodyAttributes]
// apply each to current Head, Body, BodyAttributes
// return IOEither<simpleError, domPatchMessage>

type CustomHTMLAttribute = Record<string, string>

type headUpdated = 'headUpdated'
type bodyUpdated = 'bodyUpdated'
type bodyAttributesUpdated = 'bodyAttributesUpdated'

type PageComponents = [HTMLHeadElement, HTMLBodyElement, Array<CustomHTMLAttribute>];

function updateBodyAttributes(): IO.IO<bodyAttributesUpdated> {
  return () => 'bodyAttributesUpdated';
}

function updateHead(newhead: HTMLHeadElement): IO.IO<headUpdated> {
  return () => {
    morph(document.head, newhead);
    return 'headUpdated'
  }
}

function updateBody(newbody: HTMLBodyElement): IO.IO<bodyUpdated> {
  return () => {
    morph(document.body, newbody);
    return 'bodyUpdated'
  }
}

function cleanDOM(doc: Document): Document {
  Array.from(doc.scripts).forEach(e => e.innerHTML = '//replaced');
  return doc;
}

function manageEditorUI(doc: Document): Document {
  const editorUI = doc.createElement('div');
  editorUI.setAttribute('id', 'editorchrome');
  editorUI.isSameNode = function(target): boolean {
    if (target instanceof HTMLDivElement) {
      if (target.id && target.id === 'editorchrome') {
        return true;
      } else {
        return false;
      }
    } else {
      return false;
    }
  };
  doc.body.insertAdjacentElement(
    'beforeend',
    editorUI,
  );
  return doc;
}


function pageComponents(doc: Document): IO.IO<PageComponents> {
  const attributes = Array.from(doc.body.attributes).map(a => ({[a.name]: a.value}));
  return () => ([doc.head, doc.body as HTMLBodyElement, attributes])
}

function parseDomString(domString: string): IOE.IOEither<SimpleError, Document> {
  return IOE.tryCatch(
    () => parser.parseFromString(domString, 'text/html'),
    () => ({message: 'could not parse dom'})
  )
}

const updatePageComponents = ([head, body]: PageComponents): IO.IO<[
  headUpdated,
  bodyUpdated,
  bodyAttributesUpdated,
]> =>
  Apply.sequenceT(IO.Apply)(
    updateHead(head),
    updateBody(body),
    updateBodyAttributes(),
  );

function updatePage(domString: string): IOE.IOEither<SimpleError, DOMpatched> {
  return F.pipe(
    domString,
    parseDomString,
    IOE.map(cleanDOM),
    IOE.map(manageEditorUI),
    IOE.chainW(F.flow(
      pageComponents, 
      IO.chain(updatePageComponents),
      IO.map(results => {
        const [head, body, attrs] = results;
        if(head === 'headUpdated' && body === 'bodyUpdated' && attrs === 'bodyAttributesUpdated') {
          return E.right(DOMpatched.encode({type: 'DOMpatched'}));
        } else {
          return E.left({message: 'dom patch failed'})
        }
      })
    ))
  )
}

export { updatePage }

