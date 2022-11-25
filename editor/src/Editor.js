import {Editor as SEditor, Text, Transforms, Range, Path, Point} from 'slate'
import prediction_socket from './gpt'
//const api = new API()

class CompletionState {
  endPos = null
  ellipsesPos = null
  predictStart = null
  predictEnd = null
  text = ''
  reset() {
    this.ellipsesPos = this.endPos = this.predictStart = this.predictEnd = null
    this.text = ''
  }
  get state() {
    return Object.assign({}, this)
  }
  set state(d) {
    ['ellipsesPos', 'endPos', 'predictStart', 'predictEnd', 'text'].forEach(k => {
      if (d[k] !== undefined) this[k] = d[k]
    })
  }

}
const compState = new CompletionState()
function NextNodePoint(p) {
  return {
    path: [p.path[0], p.path[1]+1],
    offset: 0
  }
}

/*
function realEnd(selection) {
  const endPos = Range.end(selection)
  return {
    path: endPos.path.slice(),
    offset: endPos.offset
  }
}
*/

const Editor = {
  ...SEditor,
  lastNChars(editor, distance=200) {
    const frontpos = Object.assign({},editor.selection.anchor)
    Transforms.move(editor, {distance, reverse: true})
    const backpos = Object.assign({},editor.selection.anchor)
    Transforms.select(editor, {
      anchor: frontpos,
      focus: backpos
    })
    const txt = Editor.textInRange(editor, editor.selection)
    Transforms.select(editor, {
      anchor: frontpos, focus: frontpos
    })
    return txt
  },

  textInRange(editor, at) {
    const range = Editor.range(editor, at)
    const [start, end] = Range.edges(range)
    let text = ''

    for (const [node, path] of Editor.nodes(editor, {
      at: range, match: Text.isText, voids: false,
    })) {
      let t = node.text

      if (Path.equals(path, end.path)) {
        t = t.slice(0, end.offset)
      }
      if (Path.equals(path, start.path)) {
        t = t.slice(start.offset)
      }

      text += t + '\n\n'
    }

    return text.slice(0,-2) // remove last two \n
  },

  isBoldMarkActive(editor) {
    const [match] = SEditor.nodes(editor, {
      match: n => n.bold === true,
      universal: true,
    })

    return !!match
  },

  isCodeBlockActive(editor) {
    const [match] = SEditor.nodes(editor, {
      match: n => n.type === 'code',
    })

    return !!match
  },

  fixVoidNodes(editor)  {
    Transforms.setNodes(
      editor, { isVoid: false }, {
        at: [],
        match: (node, path) => Text.isText(node),
      }
    )
  },

  toggleBoldMark(editor) {
    const isActive = Editor.isBoldMarkActive(editor)
    Transforms.setNodes(
      editor,
      { bold: isActive ? null : true },
      { match: n => Text.isText(n), split: true }
    )
  },

  toggleCodeBlock(editor) {
    const isActive = Editor.isCodeBlockActive(editor)
    Transforms.setNodes(
      editor,
      { type: isActive ? null : 'code' },
      { match: n => SEditor.isBlock(editor, n) }
    )
  },

  tryAddSuggestNodes(editor, curPos) {
    if (compState.endPos === null) {
      console.log('CALLING ADDITION')
      Editor.addSuggestNodes(editor, curPos)
      return true
    }
  },

  addSuggestNodes(editor, endPos) {
    Transforms.insertNodes(
      editor, [
        { text:'​', loading: true },
        { text: '​', isVoid: true }
      ]
    )
    Transforms.select(editor, endPos)
    const ellipsesPos = endPos.offset ? NextNodePoint(endPos) : endPos // todo: clone?
    const predictStart = NextNodePoint(ellipsesPos)
    const predictEnd = { path: predictStart.path, offset: 1 }
    compState.state = { endPos, ellipsesPos, predictStart, predictEnd, text: '' }
  },

  tryRmSuggestText(editor, curPos) {
    if (compState.endPos !== null && !Point.equals(curPos, compState.endPos)) {
      console.log(compState.endPos, curPos)
      console.log('CALLING REMOVAL')
      Editor.rmSuggestText(editor)
    }
  },

  rmSuggestText(editor) {
    const state = compState.state
    if (state.endPos === null) return // hotfix
    compState.reset()
    Transforms.removeNodes(
      editor, {
        at: state.predictStart.path
      }
    )
    Transforms.removeNodes(
      editor, {
        at: state.ellipsesPos.path
      }
    )
  },

  async repeatedlyExtendSuggestion(editor, prompt, uid, conf, extend) {
    const final = await prediction_socket(prompt, uid, conf, extend, (halt,text) => {
      if (compState.ellipsesPos === null) {
        return halt('INTERRUPTED')
      }
      compState.text += text
      Transforms.insertText(editor, text, {
        at: compState.predictEnd
      })
      compState.predictEnd.offset += text.length
      Transforms.select(editor, compState.endPos)
    }).catch(e => {
      console.error(e)
      window.alert(e)
      return ''
    })
    if (final !== 'INTERRUPTED') {
      Transforms.setNodes(editor, {loading: false}, {
        at: compState.ellipsesPos.path
      })
    }
  },

  acceptSuggestText(editor) {
    const state = compState.state
    Editor.rmSuggestText(editor)
    const lines = state.text.split('\n')
    const newPos = {
      path: [state.endPos.path[0]+lines.length-1, 0],
      offset: lines.at(-1).length
    }
    const nodes = state.text.split('\n').map(
      n => ({
        type: 'paragraph',
        children: [{text: n}]
      })
    )
    Transforms.insertNodes(
      editor, nodes,
      { at: state.endPos }
    )
    // remerge
    try {
      Transforms.mergeNodes(editor, { at: [state.endPos.path[0]+1] })
      Transforms.select(editor, newPos)
      Transforms.mergeNodes(editor, { at: [state.endPos.path[0]+nodes.length] }) // this one can error. don't really care.
    } catch (e) {
      console.log('acceptSuggestText() merging error:')
      console.log(e)
    }
  }
}
export default Editor
