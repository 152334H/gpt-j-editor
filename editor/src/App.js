
// Import React dependencies.
import React, { useState, useCallback, useMemo, useEffect } from 'react'
// Import the Slate editor factory.
import { createEditor, Range, Node } from 'slate'
// Import the Slate components and React plugin.
import { Slate, Editable, withReact } from 'slate-react'
//
import Box from '@mui/material/Box'
import Tooltip from '@mui/material/Tooltip'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import ListItem from '@mui/material/ListItem'
import List from '@mui/material/List'
import Fab from '@mui/material/Fab'

import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import DoneIcon from '@mui/icons-material/Done';
//
import { useMediaQuery } from 'react-responsive'
import { saveAs } from 'file-saver';
import lodash from 'lodash'
//
import PredictConfiguration from './Config';
import Render from './Elements'
import Editor from './Editor'
import {WS_URL} from './gpt'

// Define a serializing function that takes a value and returns a string.
const serialize = value => {
  return value.map(n => Node.string(n)).join('\n\n')
}
const saveTxt = json => saveAs(
  new Blob(
    [serialize(JSON.parse(json))],
    {type: "text/plain;charset=utf-8"}
  ), 'gpt-j.txt'
)

const DotItem = props => {
  return <ListItem sx={{ display: 'list-item', paddingTop: 0 }}>
    {props.children}
  </ListItem>
}

const Preamble = ({autopredict}) => {
  return <Box>
    <Typography> Test editor with GPT-J-6B </Typography>
    <List sx={{ listStyleType: 'disc', pl: 4}}>
      <DotItem>
        <Typography sx={autopredict.active ? {} : {textDecoration:'line-through'}}>
          Auto-completion begins after {autopredict.delay}ms of no cursor movement
        </Typography>
      </DotItem>
      <DotItem>
        You can also press Ctrl-k to trigger completion manually
      </DotItem>
      <DotItem>
        Press <code>Tab</code> to accept suggestion, <code>Esc</code> to ignore.
      </DotItem>
      <DotItem>
        <span style={{color: 'grey'}}>
          The default generation model is deterministic.
          If you want to <i>reroll</i> a prompt, either adjust the model params, or disable Contrastive Search entirely.
        </span>
      </DotItem>
    </List>
  </Box>
}

const floatingStyle = {
        margin: 0,
        top: 'auto',
        right: 20,
        bottom: 20,
        left: 'auto',
        position: 'fixed',
      }
const PredictButton = ({generating, initCompletion, finishCompletion}) => {
  return generating ?
    <Fab
      color='secondary' style={floatingStyle}
      variant="extended"
      onClick={finishCompletion}
    >
      <DoneIcon/>
      Accept
    </Fab> : <Fab
      color='primary' style={floatingStyle} 
      variant="extended" onClick={initCompletion}
    >
      <AutoFixHighIcon/>
      Generate
    </Fab>
}
const TextEditor = ({uid, disconnect}) => {
  const [editor] = useState(() => withReact(createEditor()))
  const [generating, setGenerating] = useState(false)
  const [autopredict, setAutopredict] = useState({active: true, delay: 1500})
  const [ctx, setCtx] = useState({prior: 200, extend: 100})
  const [conf,setConf] = useState({temp: 0.8, top_p: 0.9, top_k: 6, p_alpha: 0.6, csearch: true})
  const isTabletOrMobile = useMediaQuery({ query: '(max-width: 1224px)' })

  useEffect(() => {
    setAutopredict(ap => ({...ap, active:!isTabletOrMobile}))
  }, [isTabletOrMobile])

  const debouncedQuit = useCallback(
    lodash.debounce(disconnect,900000),
    [disconnect]
  )
  useEffect(() => {
    debouncedQuit()
    return () => debouncedQuit.cancel()
  }, [debouncedQuit]) 
  const renderElem = useCallback(Render.elem, [])
  const renderLeaf = useCallback(Render.leaf, [])
  // Update the initial content to be pulled from Local Storage if it exists.
  const initialValue = useMemo(
    () => {
      return JSON.parse(
        localStorage.getItem('content')
      ) || [
        {
          type: 'paragraph',
          children: [{ text: 'Once upon a time,' }],
        },
      ]
    }, []
  )

  const tryRemoveCompletion = () => {
    Editor.tryRmSuggestText(editor, Range.end(editor.selection))
  }
  const initCompletion = () => {
    const endPos = Object.assign({},Range.end(editor.selection))
    if (Editor.tryAddSuggestNodes(editor, endPos)) {
      setGenerating(true)
      const prompt = Editor.lastNChars(editor, ctx.prior);
      Editor.repeatedlyExtendSuggestion(editor, prompt, uid, conf, ctx.extend)
    }
  }
  const finishCompletion = useCallback(() => {
    Editor.acceptSuggestText(editor)
    setGenerating(false)
  }, [editor])
  const initCompDebounced = autopredict.active ? lodash.debounce(initCompletion, autopredict.delay) : ()=>0

  return (<>
    <Preamble autopredict={autopredict}/>
    <PredictConfiguration
      conf={conf} setConf={setConf} ctx={ctx} setCtx={setCtx}
      setAutopredict={setAutopredict} autopredict={autopredict}
      usingMobile={isTabletOrMobile}
    />
    <br/>
    <hr/>
    <Slate
      editor={editor} value={initialValue}
      onChange={value => {
        const isAstChange = editor.operations.some(
          op => 'set_selection' !== op.type
        )
        if (isAstChange) {
          // Save the value to Local Storage.
          const content = JSON.stringify(value)
          localStorage.setItem('content', content)
        }
      }}
    >
      <Editable
        editor={editor}
        renderElement={renderElem}
        renderLeaf={renderLeaf}
        onPaste={tryRemoveCompletion}
        onClick={() => {
          // selection is null on first click!
          if (editor.selection !== null) {
            tryRemoveCompletion()
            initCompDebounced()
          }
        }}
        onKeyUp={tryRemoveCompletion}
        onSelect={_ => {
          console.log('onselect', editor.selection)
        }}
        onKeyDown={e => {
          debouncedQuit()
          if (e.key === 'Tab') {
            e.preventDefault();
            finishCompletion()
            return
          } else if (e.key === 'Escape') {
            return Editor.rmSuggestText(editor)
          }
          if (!e.ctrlKey) { return initCompDebounced() }

          switch (e.key) {
            case 'k': {
              e.preventDefault();
              initCompletion();
              break
            }
            default: break
          }
        }}
      />
    </Slate>
    <hr/>
    <div>
      <Tooltip title='Exports to .txt'>
        <Button variant='contained' onClick={() => saveTxt(localStorage.getItem('content'))}>
          Export
        </Button>
      </Tooltip>
      <Tooltip title="Press this if there's grey text is hanging around">
        <Button variant='outlined' onClick={() => {
          Editor.fixVoidNodes(editor)
          window.location.reload()
        }}>
          Fix dangling
        </Button>
      </Tooltip>
      <br/>
      <br/>
    </div>
    {
      autopredict.active ? <></> :
        <PredictButton generating={generating}
          initCompletion={initCompletion}
          finishCompletion={finishCompletion}
        />
    }
  </>)
}

function attemptRegisterOnce(res,rej) {
  const ws = new WebSocket(`${WS_URL}/register`)
  ws.onerror = e => {
    rej(e)
  }
  ws.onclose = e => {
    // TODO
    if (e.code === 1012) // server has too many connections
      res({err: 'There are currently too many users on this site. Waiting for access...'})
    else if (e.code === 1008) // user already has connection
      res({err: 'You are already connected to the site elsewhere. If you just refreshed the page, this message should disappear soon.'})
  }
  ws.onmessage = e => {
    if (e.data !== '.')
      res({msg:e.data, ws})
  }
}

async function delayedRegister(delay) {
  await new Promise(res => setTimeout(res, 1000*delay))
  return await new Promise(attemptRegisterOnce)
}

const App = () => {
  const [sess,setSess] = useState({})
  const [query,setQuery] = useState({
    delay: 3, err: 'Loading...'
  })

  console.log('render')

  useEffect(() => {
    if (sess.uid !== undefined)
      return ()=>0
    delayedRegister(query.delay-3).then(res => {
      console.log('got', res)
      if (res.msg)
        setSess({
          uid: res.msg, ws: res.ws
        })
      else
        setQuery({
          delay: (query.delay**1.5)|0,
          err: res.err
        })
      return res
    }).catch(e => window.alert(e))

  }, [sess, query, setSess, setQuery])

  const disconnect = useCallback(() => {
    console.log("HEY")
    sess.ws.close()
    setQuery({
      delay: 9999999,
      err: 'You were disconnected for inactivity. Please refresh the page to rejoin.'
    })
    setSess({})
  }, [sess, setQuery, setSess])
  
  return sess.uid ? <TextEditor uid={sess.uid} disconnect={disconnect}/>
    : <Typography> {query.err} </Typography>
}

/*
const PhoneUserCheck = () => {
  const isTabletOrMobile = useMediaQuery({ query: '(max-width: 1224px)' })
  const [override,setOverride] = useState()

  return isTabletOrMobile && !override ? <Typography>
    Mobile UI is currently under development.
    Use at your own risk.
    <Button onClick={()=>setOverride(true)}/>
  </Typography> : <App/>
}
*/

export default App
