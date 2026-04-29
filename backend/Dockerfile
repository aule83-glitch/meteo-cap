FROM python:3.12-slim

WORKDIR /app

# Fonty DejaVu — wymagane przez pdf_generator.py dla polskich znaków
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-dejavu-core \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Kod aplikacji — ta warstwa NIE jest cache'owana (zmienia się często)
COPY app/ ./app/

RUN mkdir -p /data

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
