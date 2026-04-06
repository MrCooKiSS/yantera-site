venv:
	py -3.13 -m venv venv

setup: venv
	venv\Scripts\pip.exe install -r requirements.txt

run:
	venv\Scripts\python.exe app/main.py

front:
	python -m http.server 8081 --directory front/templates --bind 127.0.0.1

clean:
	rmdir /s /q venv

up:
	docker compose up --build

down:
	docker compose down
	docker rmi dotadating-frontend

downback:
	docker compose down
	docker rmi dotadating-backend
