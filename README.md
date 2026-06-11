# Setting Up a Flask Project in Visual Studio Code

If you're working on a Flask project in Visual Studio Code, `pip install -r requirements.txt` should be run in a **terminal**, not inside a Python file.

## 1. Open the Project Folder in VS Code

Make sure the folder containing your Flask project is open.

You should see files such as:

```text
project/
├── app.py
├── requirements.txt
├── static/
├── templates/
```

## 2. Open a Terminal in VS Code

In VS Code:

- Click **Terminal → New Terminal**
- Or press:
  - **Ctrl + `** (Windows/Linux)
  - **Cmd + `** (Mac)

A terminal should appear at the bottom.

## 3. Check You're in the Correct Folder

In the terminal, run:

### Mac/Linux

```bash
ls
```

### Windows

```cmd
dir
```

You should see `requirements.txt` listed.

If not, navigate to the project folder:

```bash
cd path/to/your/project
```

## 4. (Recommended) Create a Virtual Environment

Before installing dependencies:

### Windows

```cmd
python -m venv venv
venv\Scripts\activate
```

### Mac/Linux

```bash
python3 -m venv venv
source venv/bin/activate
```

After activation, you'll usually see `(venv)` at the start of the terminal prompt.

## 5. Install the Requirements

Run:

```bash
pip install -r requirements.txt
```

This reads the `requirements.txt` file and installs all required Python packages.

## 6. Run the Flask Application

After installation succeeds, look for one of these files:

- `app.py`
- `main.py`
- `run.py`

Common commands are:

```bash
python app.py
```

or

```bash
flask run
```

If using `flask run`, you may need:

### Windows (Command Prompt)

```cmd
set FLASK_APP=app.py
flask run
```

### Mac/Linux

```bash
export FLASK_APP=app.py
flask run
```

## 7. Open the Website

Flask will usually display something like:

```text
Running on http://127.0.0.1:5000
```

Open that address in your browser.
