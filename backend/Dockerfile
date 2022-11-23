FROM condaforge/mambaforge

# create conda ENV
RUN mkdir /api
COPY environment.yml /api/
RUN conda env create --file /api/environment.yml

COPY requirements.txt /api/
RUN conda run -n gpt-j pip install -r /api/requirements.txt
RUN conda run -n gpt-j pip install https://github.com/152334H/transformers/archive/v4.24-release.zip
RUN conda run -n gpt-j pip install gunicorn

# copy other files
COPY main.py model.py .env entrypoint.sh /api/
WORKDIR /api

#CMD [ "bash", "--login", "entrypoint.sh" ]
ENTRYPOINT [ "./entrypoint.sh" ]
  #"gunicorn", "-k", "uvicorn.workers.UvicornWorker", "main:app" \
