with open("templates/index.html", encoding="utf-8") as f:
    for i, line in enumerate(f):
        if r"\`" in line:
            print(i + 1, line.strip())
