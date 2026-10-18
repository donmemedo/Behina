FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py security.py ./
RUN useradd --uid 10001 --create-home app && mkdir /data && chown app:app /data
ENV DATA_DIR=/data
VOLUME /data
EXPOSE 8000
USER app
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--no-proxy-headers", "--limit-concurrency", "100", "--timeout-keep-alive", "5", "--no-server-header"]
