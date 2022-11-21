


const CodeElement = props => {
  return (
    <pre {...props.attributes}>
      <code>{props.children}</code>
    </pre>
  )
}
const DefaultElement = props => {
  return <p {...props.attributes}>{props.children}</p>
}
const Leaf = props => {
  return <span
    {...props.attributes}
    className={props.leaf.loading ? 'loading' : ''}
    style={{
      fontWeight: props.leaf.bold ? 'bold' : 'normal',
      color: props.leaf.isVoid ? 'grey' : 'inhereit'
    }}
  >
    {props.children}
  </span>
}


// NOT TO BE USED DIRECTLY

const renderElem = props => {
  switch (props.element.type) {
    case 'code':
      return <CodeElement {...props} />
    default:
      return <DefaultElement {...props} />
  }
}

const renderLeaf = props => {
  return <Leaf {...props} />
}

const Render = {
  leaf: renderLeaf,
  elem: renderElem,
}
export default Render
