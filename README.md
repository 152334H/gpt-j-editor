# GPT-J editor

This is a simple webapp (React.js + Slate.js) text editor that uses 🤗's [transformers](https://huggingface.co/docs/transformers/index) library with FastAPI websockets to run text completion for user-written text.

![image](https://user-images.githubusercontent.com/54623771/216347630-6b7832ef-0b47-4937-ad0b-91a221180ec1.png)

I made some [hacks](https://github.com/152334H/transformers/tree/v4.24-release) to the transformers library to allow for repeated token streaming, rather than returning full completion chunks at once.
