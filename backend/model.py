from typing import Optional, Generator
from pydantic import BaseModel, validator
from transformers import AutoTokenizer, GPTJForCausalLM, GPT2TokenizerFast
from dotenv import dotenv_values
import torch

FINAL_STRING = dotenv_values().get('FINAL_STRING', '<|endoftext|>')
FINAL_TOKENS = []

def group(g: Generator[torch.Tensor,None,None], n: int, tokenizer: GPT2TokenizerFast):
    g = iter(g)
    res = []
    i = 0
    while (v:=next(g,None)) is not None:
        res.append(v)

        # grab entire of FINAL_STRING if needed
        if v == FINAL_TOKENS[i]:
            i = (i+1)%len(FINAL_TOKENS)
            continue
        i = 0

        # do not return until ascii
        s = tokenizer.convert_ids_to_tokens(int(v.item()))
        assert isinstance(s,str)
        if not s.isascii(): continue

        # return if length >= chunk size
        if len(res) >= n:
            yield res
            res = []

def torch_gc():
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        torch.cuda.ipc_collect()


class CompletionRequest(BaseModel):
    # NOTE: validators are parsed in order of variables listed here:
    prompt: str
    length: int
    chunks: int=8
    top_p: Optional[float]
    temp: Optional[float]
    p_alpha: Optional[float]
    top_k: int

    @validator('length')
    def len_bounds(cls, l: int):
        if l not in range(1, 201):
            raise ValueError('length was too long (or <1)')
        return l
    @validator('top_p')
    def topp(cls, f: float):
        if f > 1 or f < 0:
            raise ValueError('top_p was not in [0,1.0]')
        return f
    @validator('temp')
    def temperate(cls, f: float):
        if f > 1.5 or f < 0:
            raise ValueError('temp was not in [0,1.5]')
        return f
    @validator('p_alpha')
    def alpha(cls, f: float):
        if f >= 1 or f <= 0:
            raise ValueError('penalty_alpha was not in (0,1)')
        return f
    @validator('top_k')
    def topk(cls, k: int, values):
        if values['p_alpha'] is not None and k <= 1: # required by transformers code (`is_contrastive_search_gen_mode`)
            raise ValueError('top_k was smaller than 2')
        return k
    @validator('chunks')
    def chunk(cls, c: int, values):
        if not c:
            raise ValueError('chunks was 0')
        if c > values['length']:
            raise ValueError('chunks was longer than length')
        return c

class LM:
    def load(self):
        print('loading model...')
        self.model = GPTJForCausalLM.from_pretrained(
            self.model_repo,
            device_map='auto', # low_cpu_mem_usage=True
            # TODO: pick between dtypes
            load_in_8bit=True,
            #torch_dtype='auto', # this will be float16 on default model
        ).to(self.device) # pyright: ignore
        self.model.eval()
    def unload(self):
        self.model = None
        torch_gc()

    def __init__(
        self,
        model_repo: str, 
        device: str='cuda',
        preload: bool=True
    ):
        self.model_repo = model_repo
        self.device = device
        #
        self.tokenizer = AutoTokenizer.from_pretrained(model_repo)
        FINAL_TOKENS[:] = list(self.tokenizer(FINAL_STRING).input_ids)
        if preload: self.load()

    @torch.no_grad()
    def predict_generator(self, req: CompletionRequest):
        # convert to tokens
        input_ids = self.tokenizer(
            req.prompt, return_tensors="pt"
        ).input_ids.to(self.device)

        params = {
            'top_k': req.top_k, 'max_new_tokens': req.length
        }
        params |= {
            'penalty_alpha': req.p_alpha
        } if req.p_alpha is not None else {
            'do_sample': True,
            'top_p': req.top_p,
            'temperature': req.temp
        }

        # get token generator
        assert self.model
        print(params)
        gen = self.model.generate(
            input_ids,
            **params
        )
        if isinstance(gen, torch.Tensor):
            gen = (t for t in gen[0,len(input_ids):,None])

        # yield token groups
        for token_group in group(gen, req.chunks, self.tokenizer): # pyright: ignore
            merged = torch.cat(token_group)
            s = self.tokenizer.decode(merged)
            if (idx := s.find(FINAL_STRING)) != -1:
                s = s[:idx]
            yield s, merged.size()[0]


class Dummy:
    def _predict_generator_single(self, _: CompletionRequest):
        for word in 'test message. This exists so that loading a full model during development is not necessary.'.split(' '):
            yield word+' '
    def predict_generator(self, req: CompletionRequest):
        for token in self._predict_generator_single(req): yield token
        #for token_group in group(self._predict_generator_single(req), req.chunks):
        #   yield ''.join(token_group)

