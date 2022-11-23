from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Request, WebSocketException
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic.error_wrappers import ValidationError
from model import LM, Dummy, CompletionRequest
from uuid import uuid4
from websockets.exceptions import ConnectionClosed
from dotenv import dotenv_values

_old_print = print
def print(*args,**kwargs): return _old_print(*args, flush=True, **kwargs)

env = dotenv_values()
MODEL_REPO = env.get('MODEL_REPO', 'EleutherAI/gpt-j-6B')
assert isinstance(MODEL_REPO,str)

m = LM(MODEL_REPO)
app = FastAPI()

class ConnectionManager:
    MAX_CONNS = int(env.get('MAX_CONNS', '5')) # pyright: ignore
    def __init__(self):
        self.clients = {}
        self.IPs = set()

    def isFull(self):
        return len(self.clients) >= ConnectionManager.MAX_CONNS

    def get_token(self, connIP: str):
        # lmao TOCTOU bugs here
        if self.isFull(): return None
        if connIP in self.IPs:
            raise WebSocketException(1008, 'Too many sessions')
        uid = uuid4().hex
        self.clients[uid] = connIP
        self.IPs.add(connIP)
        return uid

    def remove(self, uid: str):
        self.IPs.remove(self.clients[uid])
        del self.clients[uid]

manager = ConnectionManager()

import asyncio
@app.websocket('/register')
async def connect(ws: WebSocket):
    await ws.accept()

    if ws.client is None:
        raise WebSocketException(1011, 'req.client was missing (???)')
    host = ws.headers.get('cf-connecting-ip', ws.client.host)
    token = manager.get_token(host)
    if token is None:
        raise WebSocketException(1012, 'Too many connections, sorry')
    print(f'register {token=}')
    try:
        await ws.send_text(token)
        while True:
            await asyncio.sleep(10)
            await ws.send_text('.')
    except (WebSocketDisconnect, ConnectionClosed):
        print(f'remove {token=}')
        manager.remove(token)

@app.websocket("/predict/{uid}")
async def websocket_endpoint(ws: WebSocket, uid: str):
    if uid not in manager.clients:
        raise WebSocketException(1011, 'uid invalid')
    print(f'got socket from {uid=}')
    await ws.accept()
    #
    try:
        cmd = await ws.receive_text()
        if cmd == 'predict':
            print(f'got completion request')
            try:
                req = CompletionRequest(**await ws.receive_json())
            except ValidationError:
                raise WebSocketException(1008, 'Invalid request')

            # on empty prompt, do not error, but also do notihng.
            if not req.prompt:
                return await ws.close()
            print(req)
            
            gen = m.predict_generator(req)
            # this for-loop can be interrupted by the client running ws.close().
            for text in gen:
                await ws.send_text(text)
                await asyncio.sleep(req.chunks/4)
                print(f'sent {text=}')
        else: await ws.send_text("Invalid command: "+cmd)
        await ws.close()
    except (WebSocketDisconnect, ConnectionClosed): pass

