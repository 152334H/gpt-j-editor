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
        self.clients = set()

    def isFull(self):
        return len(self.clients) >= ConnectionManager.MAX_CONNS

    def get_token(self):
        if self.isFull(): return None
        uid = uuid4().hex
        self.clients.add(uid)
        return uid

    def remove(self, uid: str):
        self.clients.remove(uid)

manager = ConnectionManager()

import asyncio
@app.websocket('/register')
async def connect(ws: WebSocket):
    await ws.accept()
    token = manager.get_token()
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
            gen = m.predict_generator(req)
            # this for-loop can be interrupted by the client running ws.close().
            for text in gen:
                await ws.send_text(text)
                print(f'sent {text=}')
                await asyncio.sleep(1)
        else: await ws.send_text("Invalid command: "+cmd)
        await ws.close()
    except (WebSocketDisconnect, ConnectionClosed): pass

