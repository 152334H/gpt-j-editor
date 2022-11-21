
export const WS_URL = process.env.NODE_ENV === 'development' ? process.env.REACT_APP_WS_URL_DEV : process.env.REACT_APP_WS_URL_PROD

const prediction_socket = (prompt, uid, config, length, foreach) => {
	const json = {
		prompt, length, chunks: 4,
		...config
	}
	if (!config.csearch) json.p_alpha = undefined;

	const ws = new WebSocket(`${WS_URL}/predict/${uid}`)
	ws.onopen = _ => {
		ws.send('predict')
		ws.send(JSON.stringify(json))
	}
	let text = ''
	return new Promise((res,rej) => {
		const early_exit = resp => {
			ws.close()
			return res(resp)
		}
		ws.onerror = rej
		ws.onmessage = e => {
			foreach(early_exit, e.data, text)
			text += e.data
		}
		ws.onclose = e => {
			if (e.code === 1008)
				return rej(e.reason)
			res(text)
		}
	})
}



export default prediction_socket;
